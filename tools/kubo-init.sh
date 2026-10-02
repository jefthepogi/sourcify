#!/bin/sh
# Runs inside the Kubo container before the daemon starts (CORS for the browser app).
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://127.0.0.1:4200","http://localhost:4200"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET","POST"]'
ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
