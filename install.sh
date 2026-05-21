#!/usr/bin/env bash
set -euo pipefail

RPH_REPO_URL="${RPH_REPO_URL:-https://github.com/gywns0417/real-product-harness.git}"
RPH_REPO_SLUG="${RPH_REPO_SLUG:-gywns0417/real-product-harness}"
RPH_REF="${RPH_REF:-main}"
RPH_INSTALL_DIR="${RPH_INSTALL_DIR:-$HOME/.real-product-harness}"
RPH_BIN_DIR="${RPH_BIN_DIR:-$HOME/.local/bin}"
RPH_CONFIG_DIR="${RPH_CONFIG_DIR:-$HOME/.config/rph}"
RPH_BIN_NAME="${RPH_BIN_NAME:-rph}"
PNPM_VERSION="${PNPM_VERSION:-10.18.3}"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET="$(printf '\033[0m')"
  C_BOLD="$(printf '\033[1m')"
  C_DIM="$(printf '\033[2m')"
  C_CYAN="$(printf '\033[36m')"
  C_GREEN="$(printf '\033[32m')"
  C_MAGENTA="$(printf '\033[35m')"
  C_RED="$(printf '\033[31m')"
else
  C_RESET=""
  C_BOLD=""
  C_DIM=""
  C_CYAN=""
  C_GREEN=""
  C_MAGENTA=""
  C_RED=""
fi

banner() {
  printf '%s\n' "${C_CYAN}  ____  ____  _   _${C_RESET}"
  printf '%s\n' "${C_CYAN} |  _ \\|  _ \\| | | |${C_RESET}"
  printf '%s\n' "${C_MAGENTA} | |_) | |_) | |_| |${C_RESET}"
  printf '%s\n' "${C_MAGENTA} |  _ <|  __/|  _  |${C_RESET}"
  printf '%s\n' "${C_GREEN} |_| \\_\\_|   |_| |_|${C_RESET}"
  printf '%s\n' "${C_BOLD} Real Product Harness installer${C_RESET}"
  printf '%s\n\n' "${C_DIM} control plane bootstrap${C_RESET}"
}

info() {
  printf '%s[rph]%s %s\n' "$C_CYAN" "$C_RESET" "$*"
}

success() {
  printf '%s[rph:ok]%s %s\n' "$C_GREEN" "$C_RESET" "$*"
}

fail() {
  printf '%s[rph:error]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

need_command git
need_command node

banner

clone_repository() {
  if [ "${RPH_USE_GH:-auto}" != "0" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    info "cloning $RPH_REPO_SLUG via gh"
    gh repo clone "$RPH_REPO_SLUG" "$RPH_INSTALL_DIR" -- --depth 1 --branch "$RPH_REF"
  else
    git clone --depth 1 --branch "$RPH_REF" "$RPH_REPO_URL" "$RPH_INSTALL_DIR"
  fi
}

node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || true)"
if [ -z "$node_major" ] || [ "$node_major" -lt 22 ]; then
  fail "Node.js >= 22 is required"
fi

if ! command -v pnpm >/dev/null 2>&1; then
  need_command corepack
  info "pnpm not found; enabling pnpm@$PNPM_VERSION via corepack"
  corepack enable
  corepack prepare "pnpm@$PNPM_VERSION" --activate
fi

mkdir -p "$RPH_BIN_DIR"
mkdir -p "$RPH_CONFIG_DIR"

if [ -d "$RPH_INSTALL_DIR/.git" ]; then
  info "updating $RPH_INSTALL_DIR"
  git -C "$RPH_INSTALL_DIR" remote set-url origin "$RPH_REPO_URL"
  git -C "$RPH_INSTALL_DIR" fetch --depth 1 origin "$RPH_REF"
  git -C "$RPH_INSTALL_DIR" checkout --force FETCH_HEAD
elif [ -e "$RPH_INSTALL_DIR" ]; then
  fail "$RPH_INSTALL_DIR already exists and is not a git checkout"
else
  info "installing into $RPH_INSTALL_DIR"
  clone_repository
fi

info "installing dependencies"
pnpm --dir "$RPH_INSTALL_DIR" install --frozen-lockfile

info "building CLI"
pnpm --dir "$RPH_INSTALL_DIR" build

wrapper="$RPH_BIN_DIR/$RPH_BIN_NAME"
cat > "$wrapper" <<EOF
#!/usr/bin/env bash
exec node "$RPH_INSTALL_DIR/dist/apps/cli/src/index.js" "\$@"
EOF
chmod +x "$wrapper"

init_file="$RPH_CONFIG_DIR/init.sh"
completion_file="$RPH_CONFIG_DIR/completion.zsh"
cat > "$init_file" <<EOF
# Real Product Harness shell bootstrap.
# Source this file from ~/.zshrc or ~/.bashrc for the installed rph command.
export PATH="$RPH_BIN_DIR:\$PATH"
EOF

cat > "$completion_file" <<'EOF'
#compdef rph
_rph() {
  local -a commands
  commands=(
    help version shell runtime init status next pause resume cancel setup settings
    ask agent chat ai mcp doctor productize pm pd fe be qa notion docs github
  )
  _describe 'rph command' commands
}
_rph "$@"
EOF

"$wrapper" help >/dev/null

success "installed: $wrapper"
success "shell bootstrap: $init_file"
success "zsh completion: $completion_file"
case ":$PATH:" in
  *":$RPH_BIN_DIR:"*) ;;
  *)
    info "add this to your shell profile if rph is not found:"
    info "export PATH=\"$RPH_BIN_DIR:\$PATH\""
    ;;
esac
info "optional shell bootstrap:"
info "source \"$init_file\""

success "try: rph"
success "one-shot: rph pm start"
info "inside runtime: /init --yes --project-name \"My Product\""
