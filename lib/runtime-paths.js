'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveFromRoot(value, rootDir) {
    if (!value) return null;
    return path.resolve(rootDir, value);
}

function isWithin(candidate, parent) {
    const relative = path.relative(parent, candidate);
    return relative === '' || (
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
    );
}

function canonicalizePotentialPath(candidate) {
    let existingAncestor = candidate;
    const missingSegments = [];

    while (!fs.existsSync(existingAncestor)) {
        const parent = path.dirname(existingAncestor);
        if (parent === existingAncestor) return candidate;
        missingSegments.unshift(path.basename(existingAncestor));
        existingAncestor = parent;
    }

    const canonicalAncestor = fs.realpathSync.native(existingAncestor);
    return path.resolve(canonicalAncestor, ...missingSegments);
}

function requireOutsidePublic(candidate, publicDir, variableName) {
    const canonicalCandidate = canonicalizePotentialPath(candidate);
    const canonicalPublicDir = canonicalizePotentialPath(publicDir);
    if (isWithin(canonicalCandidate, canonicalPublicDir)) {
        throw new Error(`${variableName} must be outside the public directory`);
    }
}

function resolveRuntimePaths(env = process.env, rootDir = path.resolve(__dirname, '..'), publicDir = path.join(rootDir, 'public')) {
    const absoluteRoot = path.resolve(rootDir);
    const absolutePublicDir = path.resolve(publicDir);
    const dataDir = resolveFromRoot(env.AURA_DATA_DIR, absoluteRoot) || path.join(absoluteRoot, '.aura-data');
    const chromaPath = resolveFromRoot(env.CHROMA_PATH, absoluteRoot) || path.join(dataDir, 'chroma');

    requireOutsidePublic(dataDir, absolutePublicDir, 'AURA_DATA_DIR');
    requireOutsidePublic(chromaPath, absolutePublicDir, 'CHROMA_PATH');

    return {
        dataDir,
        chromaPath,
        logFile: path.join(dataDir, 'chroma.log'),
        pidFile: path.join(dataDir, '.chroma.pid')
    };
}

module.exports = {
    resolveRuntimePaths
};
