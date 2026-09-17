'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { resolveRuntimePaths } = require('../lib/runtime-paths');

const ROOT_DIR = path.resolve('/tmp', 'aura-runtime-path-test-root');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

test('default runtime paths are absolute and outside public', () => {
    const paths = resolveRuntimePaths({}, ROOT_DIR, PUBLIC_DIR);

    assert.deepEqual(paths, {
        dataDir: path.join(ROOT_DIR, '.aura-data'),
        chromaPath: path.join(ROOT_DIR, '.aura-data', 'chroma'),
        logFile: path.join(ROOT_DIR, '.aura-data', 'chroma.log'),
        pidFile: path.join(ROOT_DIR, '.aura-data', '.chroma.pid')
    });
    Object.values(paths).forEach((value) => assert.equal(path.isAbsolute(value), true));
    assert.equal(paths.dataDir.startsWith(`${PUBLIC_DIR}${path.sep}`), false);
});

test('relative AURA_DATA_DIR resolves from the application root', () => {
    const paths = resolveRuntimePaths({ AURA_DATA_DIR: 'runtime/local' }, ROOT_DIR, PUBLIC_DIR);

    assert.equal(paths.dataDir, path.join(ROOT_DIR, 'runtime', 'local'));
    assert.equal(paths.chromaPath, path.join(ROOT_DIR, 'runtime', 'local', 'chroma'));
});

test('absolute AURA_DATA_DIR remains absolute', () => {
    const externalDir = path.resolve('/tmp', 'aura-external-data');
    const paths = resolveRuntimePaths({ AURA_DATA_DIR: externalDir }, ROOT_DIR, PUBLIC_DIR);

    assert.equal(paths.dataDir, externalDir);
    assert.equal(paths.logFile, path.join(externalDir, 'chroma.log'));
});

test('CHROMA_PATH keeps precedence and resolves relative overrides from the application root', () => {
    const paths = resolveRuntimePaths({
        AURA_DATA_DIR: '.aura-data-custom',
        CHROMA_PATH: 'legacy/chroma-data'
    }, ROOT_DIR, PUBLIC_DIR);

    assert.equal(paths.dataDir, path.join(ROOT_DIR, '.aura-data-custom'));
    assert.equal(paths.chromaPath, path.join(ROOT_DIR, 'legacy', 'chroma-data'));
    assert.equal(paths.logFile, path.join(ROOT_DIR, '.aura-data-custom', 'chroma.log'));
    assert.equal(paths.pidFile, path.join(ROOT_DIR, '.aura-data-custom', '.chroma.pid'));
});

test('runtime directories beneath public are rejected', () => {
    assert.throws(
        () => resolveRuntimePaths({ AURA_DATA_DIR: 'public/runtime' }, ROOT_DIR, PUBLIC_DIR),
        /AURA_DATA_DIR must be outside the public directory/
    );
    assert.throws(
        () => resolveRuntimePaths({ CHROMA_PATH: 'public/chroma' }, ROOT_DIR, PUBLIC_DIR),
        /CHROMA_PATH must be outside the public directory/
    );
});

test('similarly named sibling directories are not mistaken for public', () => {
    const paths = resolveRuntimePaths({ AURA_DATA_DIR: 'public-data' }, ROOT_DIR, PUBLIC_DIR);
    assert.equal(paths.dataDir, path.join(ROOT_DIR, 'public-data'));
});

test('existing symlinks cannot redirect runtime data into public', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-runtime-symlink-test-'));
    const publicDir = path.join(rootDir, 'public');
    const linkedDataDir = path.join(rootDir, 'linked-data');
    fs.mkdirSync(publicDir);
    fs.symlinkSync(publicDir, linkedDataDir, 'dir');

    try {
        assert.throws(
            () => resolveRuntimePaths({ AURA_DATA_DIR: linkedDataDir }, rootDir, publicDir),
            /AURA_DATA_DIR must be outside the public directory/
        );
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
