#!/usr/bin/env bash
#
# dns-cutover-wizard.sh - move aayushmanchanda.com from GitHub Pages to Vercel.
#
# Interactive, one stage at a time, and safe to run again. Every stage checks
# whether it is already done before it asks you to do anything, so a re-run
# after a coffee break picks up where you left off instead of starting over.
#
# It changes nothing on its own except the SITE_URL line and the commit at the
# end, and it asks before both. Everything at the registrar is done by you, in
# the registrar's own panel, because that is the one place a script has no
# business poking around unattended.
#
# It never reads, prints, or stores a token.
#
#   scripts/dns-cutover-wizard.sh
#
# Overrides, all optional:
#   DOMAIN=example.com  VERCEL_A=76.76.21.21  VERCEL_CNAME=cname.vercel-dns.com

set -euo pipefail

DOMAIN="${DOMAIN:-aayushmanchanda.com}"
WWW="www.${DOMAIN}"
OLD_ORIGIN="https://aayushmanchandacom.vercel.app"
NEW_ORIGIN="https://${DOMAIN}"

# A public resolver, so a stale entry in the local cache cannot make a
# half-finished cutover look finished.
RESOLVER="${RESOLVER:-1.1.1.1}"

# Vercel's general-purpose anycast address and its legacy shared CNAME. Both are
# still accepted, but newer projects are issued their own values (an A record
# out of a wider pool, and a per-project CNAME like
# d1d4fc829fe7bc7c.vercel-dns-017.com). The domain card in the dashboard is the
# authority. These are only the defaults the prompts start from.
VERCEL_A_DEFAULT="${VERCEL_A:-76.76.21.21}"
VERCEL_CNAME_DEFAULT="${VERCEL_CNAME:-cname.vercel-dns.com}"

# Answered in stage 3. Declared here so the probes below are safe under `set -u`
# no matter which stage a re-run lands in first.
VERCEL_A="${VERCEL_A:-}"
VERCEL_CNAME="${VERCEL_CNAME:-}"

# GitHub Pages apex addresses: the current four, then the legacy pair that
# aayushmanchanda.com is actually sitting on today.
GH_IPS="185.199.108.153 185.199.109.153 185.199.110.153 185.199.111.153 192.30.252.153 192.30.252.154"
GH_IPV6="2606:50c0:8000::153 2606:50c0:8001::153 2606:50c0:8002::153 2606:50c0:8003::153"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_TS="${REPO_ROOT}/src/lib/site.ts"

# ---------------------------------------------------------------------------
# Output and prompts
# ---------------------------------------------------------------------------

if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; R=$'\033[0m'
else
  B=""; DIM=""; GREEN=""; YELLOW=""; RED=""; R=""
fi

say()  { printf '%s\n' "$*"; }
dim()  { printf '%s%s%s\n' "$DIM" "$*" "$R"; }
ok()   { printf '%s  ok%s   %s\n' "$GREEN" "$R" "$*"; }
warn() { printf '%s  todo%s %s\n' "$YELLOW" "$R" "$*"; }
bad()  { printf '%s  no%s   %s\n' "$RED" "$R" "$*"; }

STAGE=0
stage() {
  STAGE=$((STAGE + 1))
  printf '\n%s\n' "$(printf '%.0s-' $(seq 1 72))"
  printf '%sStage %d. %s%s\n\n' "$B" "$STAGE" "$*" "$R"
}

# Yes or no, defaulting to yes. Ctrl-D or Ctrl-C stops the wizard cleanly.
confirm() {
  local prompt="$1" reply
  while true; do
    if ! read -r -p "  ${prompt} [Y/n] " reply; then
      printf '\n'
      say "Stopped. Nothing further was changed. Re-run when you are ready."
      exit 0
    fi
    case "$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]')" in
      ""|y|yes) return 0 ;;
      n|no)     return 1 ;;
      *)        say "  Please answer y or n." ;;
    esac
  done
}

pause() {
  local reply
  if ! read -r -p "  ${1:-Press Enter when that is done. } " reply; then
    printf '\n'
    say "Stopped. Re-run when you are ready."
    exit 0
  fi
}

# ask <prompt> <default> -> echoes the answer
ask() {
  local prompt="$1" fallback="$2" reply
  if ! read -r -p "  ${prompt} [${fallback}] " reply; then
    printf '\n' >&2
    exit 0
  fi
  printf '%s' "${reply:-$fallback}"
}

# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

apex_a()   { dig +short "@${RESOLVER}" "$DOMAIN" A    2>/dev/null | grep -E '^[0-9.]+$'   || true; }
apex_aaaa(){ dig +short "@${RESOLVER}" "$DOMAIN" AAAA 2>/dev/null | grep -E '^[0-9a-f:]+$' || true; }
www_cname(){ dig +short "@${RESOLVER}" "$WWW"    CNAME 2>/dev/null || true; }

# Does the apex still answer with any GitHub Pages address?
on_github() {
  local ip
  for ip in $(apex_a) $(apex_aaaa); do
    case " ${GH_IPS} ${GH_IPV6} " in *" ${ip} "*) return 0 ;; esac
  done
  return 1
}

# Does the apex answer with the Vercel address we were told to use?
on_vercel() {
  local ip
  for ip in $(apex_a); do
    [ "$ip" = "$VERCEL_A" ] && return 0
  done
  return 1
}

# curl already writes 000 through -w when it cannot connect, and then exits
# non-zero. Capture first and fall back only on an empty result, or a refused
# connection prints 000 twice.
http_code() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null)" || true
  printf '%s' "${code:-000}"
}

site_url_now() {
  sed -n 's/.*SITE_URL = "\(.*\)".*/\1/p' "$SITE_TS" | head -n 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || { bad "$1 is not on PATH. Install it and re-run."; exit 1; }
}

# ---------------------------------------------------------------------------

cat <<BANNER

${B}DNS cutover: ${DOMAIN}${R}

  from  ${OLD_ORIGIN}
  to    ${NEW_ORIGIN}

  Eight stages. Each one tells you what it found before it asks for anything,
  and skips itself if it is already done. Stop at any point with Ctrl-C and
  re-run later; nothing is left half-applied.

BANNER

require dig
require curl
require git
confirm "Ready to start?" || { say "Fine. Re-run when you are."; exit 0; }

# ---------------------------------------------------------------------------
stage "Where things stand right now"
# ---------------------------------------------------------------------------

say "  ${DOMAIN} A records:"
if [ -n "$(apex_a)" ]; then
  apex_a | sed 's/^/    /'
else
  say "    (none)"
fi

say "  ${WWW} CNAME:"
if [ -n "$(www_cname)" ]; then
  www_cname | sed 's/^/    /'
else
  say "    (none)"
fi

say ""
if on_github; then
  warn "The apex still points at GitHub Pages."
else
  ok "No GitHub Pages address is being served for the apex."
fi

say "  SITE_URL in src/lib/site.ts is: $(site_url_now)"
say "  ${OLD_ORIGIN} responds $(http_code "${OLD_ORIGIN}/")"
say "  ${NEW_ORIGIN} responds $(http_code "${NEW_ORIGIN}/")  (000 means it did not connect, which is expected before the cutover)"
say ""
pause "Press Enter to continue. "

# ---------------------------------------------------------------------------
stage "Add ${DOMAIN} to the Vercel project"
# ---------------------------------------------------------------------------

cat <<TEXT
  Add both the apex and the www subdomain to the project named
  "aayushmanchanda.com". Vercel prompts for www when you add an apex; take it.
  www redirecting to the apex is the arrangement this site expects.

  In the dashboard:

    https://vercel.com/dashboard
    Pick the project, then Settings, then Domains, then Add Domain.

  Or from this machine, using the login the Vercel CLI already has:

    vercel domains add ${DOMAIN}
    vercel domains add ${WWW}

TEXT

if command -v vercel >/dev/null 2>&1; then
  if confirm "Run those two commands now?"; then
    # Not fatal. A domain already on the project exits non-zero, which is a
    # perfectly good outcome for a wizard that is meant to be re-run.
    vercel domains add "$DOMAIN"  || dim "  (vercel exited non-zero, likely because the domain is already added)"
    vercel domains add "$WWW"     || dim "  (vercel exited non-zero, likely because the domain is already added)"
  else
    pause "Add them in the dashboard, then press Enter. "
  fi
else
  dim "  The vercel CLI is not on PATH, so use the dashboard."
  pause "Press Enter once both are added. "
fi

# ---------------------------------------------------------------------------
stage "Read the exact record values off the Vercel domain card"
# ---------------------------------------------------------------------------

cat <<TEXT
  Do not assume these. Vercel issues newer projects their own A address and
  their own per-project CNAME target, and the domain card in Settings, Domains
  shows the pair that belongs to this project.

  The card will say something close to:

    A      @      ${VERCEL_A_DEFAULT}
    CNAME  www    ${VERCEL_CNAME_DEFAULT}

  Copy what it actually says. Press Enter to accept the default if it matches.

TEXT

VERCEL_A="$(ask "A record value for the apex:" "$VERCEL_A_DEFAULT")"
VERCEL_CNAME="$(ask "CNAME target for www:   " "$VERCEL_CNAME_DEFAULT")"

if [ -z "$VERCEL_A" ] || [ -z "$VERCEL_CNAME" ]; then
  say ""
  bad "Both values are needed. Re-run and copy them off the domain card."
  exit 1
fi

say ""
ok "Using A = ${VERCEL_A}, CNAME = ${VERCEL_CNAME}"

# ---------------------------------------------------------------------------
stage "Set the records at the registrar, and delete the GitHub Pages ones"
# ---------------------------------------------------------------------------

if on_vercel && ! on_github; then
  ok "The apex already resolves to ${VERCEL_A} and no GitHub address is left. Skipping."
else
  REG_NS="$(dig +short "@${RESOLVER}" "$DOMAIN" NS 2>/dev/null | head -n 2 | tr '\n' ' ')"
  say "  Nameservers: ${REG_NS:-unknown}"
  case "$REG_NS" in
    *registrar-servers.com*)
      say "  That is Namecheap. Domain List, then Manage, then Advanced DNS."
      ;;
    *)
      say "  Open whichever panel those nameservers belong to."
      ;;
  esac

  cat <<TEXT

  ${B}Add or edit${R}

    Type    Host    Value
    A       @       ${VERCEL_A}
    CNAME   www     ${VERCEL_CNAME}

  Set TTL to the shortest the registrar offers, five minutes if it is on the
  list. You can put it back to automatic in a day.

  ${B}Delete${R}

  Every A record on @ that is not ${VERCEL_A}. On this domain that means the
  GitHub Pages addresses, which today are:

TEXT
  for ip in $(apex_a); do
    case " ${GH_IPS} " in
      *" ${ip} "*) say "    A      @    ${ip}    <- delete" ;;
      *)           [ "$ip" = "$VERCEL_A" ] || say "    A      @    ${ip}    <- delete, not a Vercel address" ;;
    esac
  done
  if [ -n "$(apex_aaaa)" ]; then
    say ""
    say "  And every AAAA record on @, all of which are GitHub Pages:"
    for ip in $(apex_aaaa); do say "    AAAA   @    ${ip}    <- delete"; done
  fi

  cat <<TEXT

  Also delete any old www record that is not the CNAME above. Two records on
  one host is the classic way to make this look like it worked from your laptop
  and stay broken for everyone else.

  Leave the MX and TXT records alone. This is a web cutover, not a mail one.

TEXT
  pause "Press Enter once the registrar shows the new records and none of the old ones. "
fi

# ---------------------------------------------------------------------------
stage "Wait for it to propagate, and verify"
# ---------------------------------------------------------------------------

say "  Polling ${RESOLVER} every 30 seconds. Ctrl-C stops the wizard; the DNS change is unaffected."
say ""

attempt=0
max_attempts=40   # 20 minutes
while :; do
  attempt=$((attempt + 1))
  a_now="$(apex_a | tr '\n' ' ')"

  if on_vercel && ! on_github; then
    ok "Apex resolves to ${a_now}"
    break
  fi

  printf '  %s[%02d/%02d]%s apex = %s\n' "$DIM" "$attempt" "$max_attempts" "$R" "${a_now:-nothing yet}"

  if [ "$attempt" -ge "$max_attempts" ]; then
    say ""
    warn "Still not there after 20 minutes."
    say "  Check the registrar saved the change, and that no second A record on @ survived."
    confirm "Keep waiting?" && { attempt=0; continue; }
    break
  fi
  sleep 30
done

say ""
say "  www:"
www_cname | sed 's/^/    /' || true

say ""
say "  Vercel issues the certificate once DNS resolves, which usually takes another"
say "  minute or two. A 526 or a TLS error here means wait, not broken."
say ""

for path in "/" "/llms.txt" "/sitemap-index.xml"; do
  say "    ${NEW_ORIGIN}${path} -> $(http_code "${NEW_ORIGIN}${path}")"
done
say "    https://${WWW}/ -> $(http_code "https://${WWW}/")  (a 3xx is correct; www should redirect to the apex)"
say ""

MD_TYPE="$(curl -sS -o /dev/null -w '%{content_type}' --max-time 15 -H 'Accept: text/markdown' "${NEW_ORIGIN}/tools" 2>/dev/null || true)"
say "    Accept: text/markdown on /tools -> ${MD_TYPE:-no answer}"
say "    (text/markdown means the vercel.json negotiation survived the move)"
say ""

confirm "Does that all look right?" || {
  say ""
  say "  Stop here then. The site is still live at ${OLD_ORIGIN}, SITE_URL is untouched,"
  say "  and re-running this wizard will pick up from the verify stage."
  exit 0
}

# ---------------------------------------------------------------------------
stage "Flip SITE_URL"
# ---------------------------------------------------------------------------

CURRENT="$(site_url_now)"

if [ "$CURRENT" = "$NEW_ORIGIN" ]; then
  ok "src/lib/site.ts already says ${NEW_ORIGIN}. Skipping."
else
  say "  src/lib/site.ts is the only place the origin is written down. The canonical"
  say "  tags, the sitemap, the JSON-LD, /llms.txt, /robots.txt and every absolute URL"
  say "  in the markdown variants all derive from this one line."
  say ""
  say "    - export const SITE_URL = \"${CURRENT}\";"
  say "    + export const SITE_URL = \"${NEW_ORIGIN}\";"
  say ""

  if confirm "Make that edit?"; then
    tmp="${SITE_TS}.wizard.tmp"
    sed "s|export const SITE_URL = \"${CURRENT}\";|export const SITE_URL = \"${NEW_ORIGIN}\";|" "$SITE_TS" > "$tmp"
    if [ "$(sed -n 's/.*SITE_URL = "\(.*\)".*/\1/p' "$tmp" | head -n 1)" != "$NEW_ORIGIN" ]; then
      rm -f "$tmp"
      bad "The edit did not take. Change the line by hand and re-run."
      exit 1
    fi
    mv "$tmp" "$SITE_TS"
    ok "src/lib/site.ts now says ${NEW_ORIGIN}"
  else
    say "  Left alone. Nothing after this stage will be right until it is changed."
    exit 0
  fi
fi

say ""
if confirm "Build now, to prove the new origin comes out the other side?"; then
  # A failed build is a finding, not a reason to abandon the wizard mid-cutover.
  ( cd "$REPO_ROOT" && npm run build ) || warn "The build failed. Read the error above before you commit anything."
  say ""
  if grep -rq "$NEW_ORIGIN" "${REPO_ROOT}/dist/llms.txt" 2>/dev/null; then
    ok "dist/llms.txt carries ${NEW_ORIGIN}"
  else
    warn "Could not find ${NEW_ORIGIN} in dist/llms.txt. Worth a look before committing."
  fi
  if grep -rq "$OLD_ORIGIN" "${REPO_ROOT}/dist" 2>/dev/null; then
    warn "The old origin still appears somewhere in dist/. Worth a look:"
    grep -rl "$OLD_ORIGIN" "${REPO_ROOT}/dist" 2>/dev/null | head -n 5 | sed 's/^/    /'
  else
    ok "The old origin appears nowhere in dist/"
  fi
fi

# ---------------------------------------------------------------------------
stage "Commit and push"
# ---------------------------------------------------------------------------

cd "$REPO_ROOT"

if [ -z "$(git status --porcelain -- src/lib/site.ts)" ]; then
  ok "src/lib/site.ts has no uncommitted change. Either it is already pushed, or nothing moved."
else
  git --no-pager diff -- src/lib/site.ts
  say ""
  if confirm "Commit and push that?"; then
    git add -- src/lib/site.ts
    git commit -m "Point the canonical origin at ${DOMAIN}"
    git push
    ok "Pushed. Vercel builds the push."
    say ""
    say "  Give the deploy a minute, then:"
    say "    curl -sS ${NEW_ORIGIN}/llms.txt | head -n 3"
  else
    say "  Not committed. The working tree still holds the change."
  fi
fi

say ""
say "  One last thing the wizard cannot do for you: in Vercel, Settings, Domains,"
say "  make ${DOMAIN} the production domain, and check ${WWW} is set to redirect"
say "  to it rather than serving its own copy."
say ""
pause "Press Enter once that is set. "

# ---------------------------------------------------------------------------
stage "Re-scan"
# ---------------------------------------------------------------------------

cat <<TEXT
  The is-agentic score is tied to the origin, so the new domain starts from
  nothing and has to be scanned on its own.

  Their API serves the last completed report and has no way to force a fresh
  one, so the first call on a brand new domain is the honest one. If you re-run
  it later and the "Scanned" timestamp has not moved, you are reading a cached
  report, and a new scan has to be started from https://is-agentic.com.

TEXT

if confirm "Run it now?"; then
  npx -y is-agentic "$DOMAIN" || dim "  (the scan did not complete; try again shortly)"
fi

printf '\n%s\n' "$(printf '%.0s-' $(seq 1 72))"
cat <<DONE

${B}Done.${R}

  ${NEW_ORIGIN} is the site. The .vercel.app URL keeps working and now serves
  pages whose canonical tag points at the apex, which is what you want.

  Still worth checking by hand, once:

    - the og image, at https://www.opengraph.xyz/url/${NEW_ORIGIN}
    - Search Console, if the old origin was ever verified there
    - any link to the .vercel.app URL you have handed out

DONE
