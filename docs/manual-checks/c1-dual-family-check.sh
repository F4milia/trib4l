#!/bin/bash
# C1 named edge case, checked against RAW PostgREST rather than through
# supabase-js. The SDK is the thing under suspicion as much as the policy is.
set -u
API="http://127.0.0.1:54321"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
CAREGIVER="00000000-0000-0000-0000-00000000000a"
FOUNDER="00000000-0000-0000-0000-00000000000b"
BOB_DAVE_DM="00000000-0000-0000-0000-0000000dd001"

token() {
  curl -s -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"password123\",\"gotrue_meta_security\":{\"captcha_token\":\"cloudflare-test-secret-accepts-any-token\"}}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
}

get() { # $1 token, $2 path+query
  curl -s "$API/rest/v1/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1"
}

count() { python3 -c "import sys,json; print(len(json.load(sys.stdin)))"; }

ALICE=$(token alice@f4milia.test)
echo "=== Alice is the dual-Family user: Caregiver Circle + Founder Collective ==="

echo -n "1. rooms visible in Caregiver Circle .......... "
get "$ALICE" "conversations?org_id=eq.$CAREGIVER&select=id,kind" | tee /tmp/_a.json | count

echo -n "2. rooms visible in Founder Collective ........ "
get "$ALICE" "conversations?org_id=eq.$FOUNDER&select=id,kind" | tee /tmp/_b.json | count

echo -n "3. Bob-to-Dave DM in HER OWN Family (want 0) .. "
get "$ALICE" "conversations?id=eq.$BOB_DAVE_DM&select=id" | count

echo -n "4. messages in that DM (want 0) .............. "
get "$ALICE" "messages?conversation_id=eq.$BOB_DAVE_DM&select=id" | count

echo -n "5. any message body containing PRIVATE (want 0) "
get "$ALICE" "messages?select=body" | python3 -c "
import sys,json
print(len([m for m in json.load(sys.stdin) if 'PRIVATE' in m['body']]))"

echo
echo "=== every message Alice can see, with its Family ==="
get "$ALICE" "messages?select=body,org_id" | python3 -c "
import sys,json
names={'$CAREGIVER':'caregiver-circle','$FOUNDER':'founder-collective'}
for m in json.load(sys.stdin):
    print(f\"  {names.get(m['org_id'], m['org_id']):20} {m['body']}\")"

echo
echo "=== the two room sets must not overlap ==="
python3 -c "
import json
a={c['id'] for c in json.load(open('/tmp/_a.json'))}
b={c['id'] for c in json.load(open('/tmp/_b.json'))}
print('  Caregiver rooms :', len(a))
print('  Founder rooms   :', len(b))
print('  Overlap         :', len(a & b), '(must be 0)')"
