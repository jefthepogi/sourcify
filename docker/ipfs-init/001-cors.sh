#!/bin/sh
set -eu

ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin \
  '["http://127.0.0.1:4200","http://localhost:4200"]'

ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods \
  '["GET","POST","OPTIONS"]'