#!/bin/bash
set -e

echo "Waiting for MongoDB to be ready..."
WAIT_LIMIT=60
WAITED=0
until mongosh --host mongodb --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  WAITED=$((WAITED + 1))
  if [ "$WAITED" -ge "$WAIT_LIMIT" ]; then
    echo "ERROR: MongoDB not ready after ${WAIT_LIMIT}s, exiting"
    exit 1
  fi
  sleep 1
done
echo "MongoDB is ready (took ${WAITED}s)"

echo "Checking replica set status..."
RS_INITIALIZED=$(mongosh --host mongodb --quiet --eval "
  try {
    var s = rs.status();
    if (s.ok === 1 && s.members && s.members.length > 0) {
      var correctHost = s.members.some(function(m) { return m.host === 'mongodb:27017'; });
      print(correctHost ? 'CORRECT' : 'WRONG_HOST');
    } else {
      print('NOT_INIT');
    }
  } catch(e) {
    print('NOT_INIT');
  }
" 2>/dev/null || echo "NOT_INIT")

if [ "$RS_INITIALIZED" = "CORRECT" ]; then
  echo "Replica set already initialized correctly"
  exit 0
fi

if [ "$RS_INITIALIZED" = "WRONG_HOST" ]; then
  echo "Reconfiguring replica set with correct hostname..."
  mongosh --host mongodb --quiet --eval '
    var conf = rs.conf();
    conf.members[0].host = "mongodb:27017";
    rs.reconfig(conf, { force: true });
  ' || echo "Warning: reconfig may have failed"
  echo "Replica set reconfigured"
else
  echo "Initializing replica set..."
  mongosh --host mongodb --quiet --eval '
    rs.initiate({
      _id: "rs0",
      members: [{ _id: 0, host: "mongodb:27017" }]
    });
  ' || echo "Warning: initiate may have failed"
  echo "Replica set initialized"
fi

# Wait for replica set to elect a primary
echo "Waiting for primary to be available..."
for i in $(seq 1 30); do
  IS_PRIMARY=$(mongosh --host mongodb --quiet --eval "
    try {
      var s = rs.status();
      print(s.members.some(function(m) { return m.stateStr === 'PRIMARY' }) ? 'YES' : 'NO');
    } catch(e) {
      print('NO');
    }
  " 2>/dev/null || echo "NO")
  if [ "$IS_PRIMARY" = "YES" ]; then
    echo "Primary is available (took ${i}s)"
    exit 0
  fi
  sleep 1
done

echo "Warning: Primary not yet available after 30s, but replica set is configured"
exit 0
