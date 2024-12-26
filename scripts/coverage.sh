#!/bin/env bash

force=false

while [[ -n "$1" ]]; do
  case "$1" in
    -f | --force)
      force=true
      ;;
  esac
  shift
done

dest="./markdown/coverage_report.md"

npm run test -- --coverage 2>&1 | tee | sed 's/\s*$//' > "$dest"
