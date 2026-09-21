'use strict';

const crypto = require('node:crypto');
const express = require('express');

const SESSION_COOKIE = '__Host-aura';
const LOGIN_COOKIE = '__Host-aura-login';
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_AGE_MS = 10 * 60 * 1000;

function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function cookieValue(req, name) {
    const cookies = String(req.headers.cookie || '').split(';');
    const item = cookies.map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
    return item ? item.slice(name.length + 1) : '';
}

function equalToken(left, right) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function createHostedAuth({ store, config, oidc, discovery }) {
    if (!store || !config?.enabled || !oidc || !discovery) throw new TypeError('Hosted auth requires initialized services');
    const router = express.Router();
    const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' };

    router.get('/login', async (_req, res) => {
        const state = randomToken();
        const verifier = oidc.randomPKCECodeVerifier();
        const challenge = await oidc.calculatePKCECodeChallenge(verifier);
        await store.createLoginFlow(hash(state), verifier, new Date(Date.now() + LOGIN_AGE_MS));
        res.cookie(LOGIN_COOKIE, state, {
            ...cookieOptions, path: '/', maxAge: LOGIN_AGE_MS
        });
        const redirect = oidc.buildAuthorizationUrl(discovery, {
            redirect_uri: `${config.publicOrigin}/api/auth/callback`,
            scope: 'openid email profile',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256'
        });
        res.redirect(302, redirect.href);
    });

    router.get('/callback', async (req, res) => {
        const state = String(req.query.state || '');
        if (!equalToken(state, cookieValue(req, LOGIN_COOKIE))) {
            return res.status(400).send('Sign-in session expired. Please try again.');
        }
        const flow = await store.consumeLoginFlow(hash(state));
        if (!flow) return res.status(400).send('Sign-in session expired. Please try again.');
        res.clearCookie(LOGIN_COOKIE, { ...cookieOptions, path: '/' });

        const url = new URL(req.originalUrl, config.publicOrigin);
        const tokens = await oidc.authorizationCodeGrant(discovery, url, {
            pkceCodeVerifier: flow.verifier,
            expectedState: state
        });
        const claims = tokens.claims();
        if (!claims?.sub) return res.status(403).send('Sign-in identity was incomplete.');
        const account = await store.accountForIdentity(config.issuer, claims.sub);
        const token = randomToken();
        const csrfToken = randomToken();
        await store.issueSession(hash(token), account.id, csrfToken, new Date(Date.now() + SESSION_AGE_MS));
        res.cookie(SESSION_COOKIE, token, { ...cookieOptions, path: '/', maxAge: SESSION_AGE_MS });
        return res.redirect(302, '/');
    });

    async function requireSession(req, res, next) {
        const token = cookieValue(req, SESSION_COOKIE);
        if (!token) return res.status(401).json({ error: 'Sign in to Aura first.' });
        const session = await store.resolveSession(hash(token));
        if (!session) return res.status(401).json({ error: 'Your session expired. Sign in again.' });
        req.accountId = session.accountId;
        req.csrfToken = session.csrfToken;
        req.sessionTokenHash = hash(token);
        return next();
    }

    function requireCsrf(req, res, next) {
        const origin = String(req.headers.origin || '');
        const token = String(req.headers['x-aura-csrf'] || '');
        if (origin !== config.publicOrigin || !equalToken(token, req.csrfToken)) {
            return res.status(403).json({ error: 'This request could not be verified.' });
        }
        return next();
    }

    router.post('/logout', requireSession, requireCsrf, async (req, res) => {
        await store.revokeSession(req.sessionTokenHash);
        res.clearCookie(SESSION_COOKIE, { ...cookieOptions, path: '/' });
        res.json({ signedOut: true });
    });

    return { router, requireSession, requireCsrf };
}

module.exports = { createHostedAuth };
