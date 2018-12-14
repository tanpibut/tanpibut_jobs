#!/bin/bash
BIGSTREAM_URL=bigstream:19980

for file in jobs/*.json; do
    echo "$file"
    curl -X POST --data @"$file" -H "Content-Type:application/json" http://$BIGSTREAM_URL/v1.2/jobs
    echo ""
done
echo "reload job : "
curl -X GET http://$BIGSTREAM_URL/v1.2/jobs?reload=true
