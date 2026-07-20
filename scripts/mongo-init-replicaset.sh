#!/bin/bash
set -e

echo "Waiting for MongoDB to be ready..."
until mongosh --host mongodb --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  sleep 1
done

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
")

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
  '
  echo "Replica set reconfigured"
else
  echo "Initializing replica set..."
  mongosh --host mongodb --quiet --eval '
    rs.initiate({
      _id: "rs0",
      members: [{ _id: 0, host: "mongodb:27017" }]
    });
  '
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
  ")
  if [ "$IS_PRIMARY" = "YES" ]; then
    echo "Primary is available"
    exit 0
  fi
  sleep 1
done

echo "Warning: Primary not yet available, but replica set is configured"
