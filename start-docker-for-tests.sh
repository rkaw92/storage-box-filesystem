#!/bin/bash
set -e
docker-compose --env-file=.env.test up -d
