const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const util = require('node:util')
const express = require('express')

// config@3.x relies on util predicates removed in modern Node releases;
// restore just enough of them before any config-dependent module loads.
if (typeof util.isArray !== 'function') {
  util.isArray = Array.isArray
}

if (typeof util.isRegExp !== 'function') {
  util.isRegExp = value => value instanceof RegExp
}

if (typeof util.isDate !== 'function') {
  util.isDate = value => value instanceof Date
}

if (typeof util.isObject !== 'function') {
  util.isObject = value => value !== null && typeof value === 'object'
}

if (typeof util.isPromise !== 'function') {
  util.isPromise = value => value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
}

const repoRoot = path.join(__dirname, '..')

// One temp root for uploads/sessions/logs; every test gets its own fresh
// working directory and database underneath it.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noisedash-test-'))
const sampleUploadPath = path.join(tempRoot, 'samples')
const sessionFileStorePath = path.join(tempRoot, 'sessions')
const logFile = path.join(tempRoot, 'noisedash.log')

fs.mkdirSync(sampleUploadPath, { recursive: true })
fs.mkdirSync(sessionFileStorePath, { recursive: true })

// config reads NODE_CONFIG before its first require; point every writable
// location at the temp directory so the test never touches real data.
process.env.NODE_CONFIG = JSON.stringify({
  Server: {
    sampleUploadPath,
    sessionFileStorePath,
    logFile,
    maxSampleSize: 1024
  }
})

let setupCounter = 0

function purgeServerModuleCache () {
  for (const key of Object.keys(require.cache)) {
    if (key.split(/[\\/]/).includes('server')) {
      delete require.cache[key]
    }
  }
}

function removeWithRetry (target) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'ENOTEMPTY') {
        throw err
      }
    }

    // On Windows a just-closed SQLite handle may need a tick before release.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }

  fs.rmSync(target, { recursive: true, force: true })
}

function run (db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        return reject(err)
      }

      resolve(this)
    })
  })
}

function get (db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        return reject(err)
      }

      resolve(row)
    })
  })
}

function all (db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err)
      }

      resolve(rows)
    })
  })
}

async function waitForSchema (db) {
  const deadline = Date.now() + 10000

  while (Date.now() < deadline) {
    const columns = await all(db, 'PRAGMA table_info(samples)')

    if (columns.some(column => column.name === 'fade_in')) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 50))
  }

  throw new Error('Timed out waiting for database schema initialization')
}

// Builds an isolated app instance: temp database, freshly required routers,
// and a stub authentication middleware that sets req.user like passport does.
async function setup (actorId) {
  // The db module opens the relative path db/db.sqlite3, so give every test
  // its own working directory under the temp root.
  setupCounter += 1
  const workDir = path.join(tempRoot, 'work-' + setupCounter)

  fs.mkdirSync(path.join(workDir, 'db'), { recursive: true })
  process.chdir(workDir)

  purgeServerModuleCache()

  const uncaught = []
  const onUncaught = err => uncaught.push(err)

  process.on('uncaughtException', onUncaught)

  let db
  let server

  try {
    db = require('../server/db')
    const samplesRouter = require('../server/routes/samples')
    const profilesRouter = require('../server/routes/profiles')

    require('../server/boot/db')()
    await waitForSchema(db)

    const app = express()

    app.use(express.json())
    app.use((req, res, next) => {
      req.user = actorId === null ? undefined : { id: String(actorId) }
      next()
    })
    app.use(samplesRouter)
    app.use(profilesRouter)

    server = await new Promise(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
    })
  } catch (err) {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }

    if (db) {
      await new Promise(resolve => db.close(resolve))
    }

    process.removeListener('uncaughtException', onUncaught)
    process.chdir(repoRoot)
    removeWithRetry(workDir)
    purgeServerModuleCache()
    throw err
  }

  const baseUrl = 'http://127.0.0.1:' + server.address().port

  return {
    db,
    baseUrl,
    teardown: async () => {
      process.removeListener('uncaughtException', onUncaught)
      await new Promise(resolve => server.close(resolve))
      await new Promise(resolve => db.close(resolve))
      // Windows refuses to remove a directory that is the process CWD.
      process.chdir(repoRoot)
      removeWithRetry(workDir)
      purgeServerModuleCache()
      assert.deepEqual(uncaught, [], 'route handler threw an uncaught exception')
    }
  }
}

async function insertSample (db, userId, name, values = {}) {
  const result = await run(db, `INSERT INTO samples
    (name, user, fade_in, loop_points_enabled, loop_start, loop_end)
    VALUES (?, ?, ?, ?, ?, ?)`, [
    name,
    userId,
    values.fadeIn === undefined ? 0.5 : values.fadeIn,
    values.loopPointsEnabled === undefined ? 1 : (values.loopPointsEnabled ? 1 : 0),
    values.loopStart === undefined ? 10 : values.loopStart,
    values.loopEnd === undefined ? 20 : values.loopEnd
  ])

  return result.lastID
}

async function insertProfile (db, userId, name) {
  const result = await run(db, 'INSERT INTO profiles (name, user) VALUES (?, ?)', [
    name,
    userId
  ])

  return result.lastID
}

async function insertLink (db, profileId, sampleId, volume) {
  await run(db, 'INSERT INTO profiles_samples (profile, sample, volume) VALUES (?, ?, ?)', [
    profileId,
    sampleId,
    volume
  ])
}

function request (baseUrl, method, route, body) {
  const options = { method }

  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' }
  }

  return fetch(baseUrl + route, body === undefined
    ? options
    : { ...options, body: JSON.stringify(body) })
}

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

test('owner can read their own sample and response shape is unchanged', async () => {
  const env = await setup(1)

  try {
    const sampleId = await insertSample(env.db, 1, 'rain')
    const res = await request(env.baseUrl, 'GET', '/samples/' + sampleId)

    assert.equal(res.status, 200)

    const body = await res.json()

    assert.deepEqual(Object.keys(body), ['sample'])
    assert.equal(body.sample.id, sampleId)
    assert.equal(body.sample.name, 'rain')
    assert.equal(body.sample.fadeIn, 0.5)
    assert.equal(body.sample.loopPointsEnabled, true)
    assert.equal(body.sample.loopStart, 10)
    assert.equal(body.sample.loopEnd, 20)
    assert.equal(body.sample.user, '1')
  } finally {
    await env.teardown()
  }
})

test('reading a sample owned by another user is rejected with 401', async () => {
  const env = await setup(2)

  try {
    const sampleId = await insertSample(env.db, 1, 'rain')
    const res = await request(env.baseUrl, 'GET', '/samples/' + sampleId)

    assert.equal(res.status, 401)
  } finally {
    await env.teardown()
  }
})

test('reading a nonexistent sample id returns 401 and the service keeps running', async () => {
  const env = await setup(1)

  try {
    const missing = await request(env.baseUrl, 'GET', '/samples/9999')

    assert.equal(missing.status, 401)

    // A follow-up request must still succeed, proving the process did not crash.
    const ownId = await insertSample(env.db, 1, 'wind')
    const healthy = await request(env.baseUrl, 'GET', '/samples/' + ownId)

    assert.equal(healthy.status, 200)
    const body = await healthy.json()
    assert.equal(body.sample.id, ownId)
  } finally {
    await env.teardown()
  }
})

test('updating a sample owned by another user is rejected and its fields stay unchanged', async () => {
  const env = await setup(2)

  try {
    const sampleId = await insertSample(env.db, 1, 'rain', {
      fadeIn: 0.5,
      loopPointsEnabled: true,
      loopStart: 10,
      loopEnd: 20
    })
    const before = await get(env.db, 'SELECT * FROM samples WHERE id = ?', [sampleId])

    const res = await request(env.baseUrl, 'PUT', '/samples/' + sampleId, {
      fadeIn: 9.9,
      loopPointsEnabled: false,
      loopStart: 111,
      loopEnd: 222
    })

    assert.equal(res.status, 401)

    const after = await get(env.db, 'SELECT * FROM samples WHERE id = ?', [sampleId])

    assert.deepEqual(after, before)
  } finally {
    await env.teardown()
  }
})

test('updating a nonexistent sample id returns 401 without crashing the service', async () => {
  const env = await setup(1)

  try {
    const res = await request(env.baseUrl, 'PUT', '/samples/9999', {
      fadeIn: 1,
      loopPointsEnabled: true,
      loopStart: 1,
      loopEnd: 2
    })

    assert.equal(res.status, 401)

    const ownId = await insertSample(env.db, 1, 'wind')
    const healthy = await request(env.baseUrl, 'GET', '/samples/' + ownId)

    assert.equal(healthy.status, 200)
  } finally {
    await env.teardown()
  }
})

test('owner can update their own sample with 200 and the new values are persisted', async () => {
  const env = await setup(1)

  try {
    const sampleId = await insertSample(env.db, 1, 'rain')
    const res = await request(env.baseUrl, 'PUT', '/samples/' + sampleId, {
      fadeIn: 3.5,
      loopPointsEnabled: false,
      loopStart: 40,
      loopEnd: 80
    })

    assert.equal(res.status, 200)

    const row = await get(env.db, 'SELECT * FROM samples WHERE id = ?', [sampleId])

    assert.equal(row.fade_in, 3.5)
    assert.equal(row.loop_points_enabled, 0)
    assert.equal(row.loop_start, 40)
    assert.equal(row.loop_end, 80)
  } finally {
    await env.teardown()
  }
})

test('owner deleting a profile removes it together with its profiles_samples rows', async () => {
  const env = await setup(1)

  try {
    const profileId = await insertProfile(env.db, 1, 'night')
    const sampleA = await insertSample(env.db, 1, 'rain')
    const sampleB = await insertSample(env.db, 1, 'wind')

    await insertLink(env.db, profileId, sampleA, -5)
    await insertLink(env.db, profileId, sampleB, -8)

    const res = await request(env.baseUrl, 'DELETE', '/profiles/' + profileId)

    assert.equal(res.status, 200)

    const profileRow = await get(env.db, 'SELECT * FROM profiles WHERE id = ?', [profileId])
    const links = await all(env.db, 'SELECT * FROM profiles_samples WHERE profile = ?', [profileId])

    assert.equal(profileRow, undefined)
    assert.deepEqual(links, [])

    // The samples themselves are untouched.
    const remainingSamples = await all(env.db, 'SELECT id FROM samples ORDER BY id')
    assert.equal(remainingSamples.length, 2)
  } finally {
    await env.teardown()
  }
})

test('deleting a profile owned by another user is rejected with 401 and all data remains', async () => {
  const env = await setup(2)

  try {
    const profileId = await insertProfile(env.db, 1, 'night')
    const sampleId = await insertSample(env.db, 1, 'rain')

    await insertLink(env.db, profileId, sampleId, -5)

    const res = await request(env.baseUrl, 'DELETE', '/profiles/' + profileId)

    assert.equal(res.status, 401)

    const profileRow = await get(env.db, 'SELECT * FROM profiles WHERE id = ?', [profileId])
    const links = await all(env.db, 'SELECT * FROM profiles_samples WHERE profile = ?', [profileId])

    assert.ok(profileRow, 'profile must still exist')
    assert.equal(links.length, 1)
    assert.equal(links[0].sample, sampleId)
  } finally {
    await env.teardown()
  }
})

test('deleting a nonexistent profile id returns 401 and deletes nothing', async () => {
  const env = await setup(1)

  try {
    const profileId = await insertProfile(env.db, 1, 'night')
    const sampleId = await insertSample(env.db, 1, 'rain')

    await insertLink(env.db, profileId, sampleId, -5)

    const profilesBefore = await all(env.db, 'SELECT * FROM profiles')
    const linksBefore = await all(env.db, 'SELECT * FROM profiles_samples')

    const res = await request(env.baseUrl, 'DELETE', '/profiles/9999')

    assert.equal(res.status, 401)

    const profilesAfter = await all(env.db, 'SELECT * FROM profiles')
    const linksAfter = await all(env.db, 'SELECT * FROM profiles_samples')

    assert.deepEqual(profilesAfter, profilesBefore)
    assert.deepEqual(linksAfter, linksBefore)
  } finally {
    await env.teardown()
  }
})
