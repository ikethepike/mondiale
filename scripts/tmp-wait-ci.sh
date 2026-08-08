until state=$(gh pr checks 126 2>/dev/null); [ -n "$state" ] && ! echo "$state" | grep -q pending; do sleep 30; done; gh pr checks 126
