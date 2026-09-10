#!/usr/bin/env bash
cd "$(dirname "$0")/../frontend" || exit 1
npm install
npm run dev
