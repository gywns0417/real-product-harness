#!/usr/bin/env bash
set -euo pipefail

RPH_REPO_URL="${RPH_REPO_URL:-https://github.com/gywns0417/real-product-harness.git}"
RPH_REPO_SLUG="${RPH_REPO_SLUG:-gywns0417/real-product-harness}"
RPH_REF="${RPH_REF:-main}"
RPH_INSTALL_DIR="${RPH_INSTALL_DIR:-$HOME/.real-product-harness}"
RPH_BIN_DIR="${RPH_BIN_DIR:-$HOME/.local/bin}"
RPH_CONFIG_DIR="${RPH_CONFIG_DIR:-$HOME/.config/rph}"
RPH_BIN_NAME="${RPH_BIN_NAME:-rph}"
RPH_LOCAL_SOURCE_DIR="${RPH_LOCAL_SOURCE_DIR:-}"
RPH_AUTO_SHELL_INTEGRATION="${RPH_AUTO_SHELL_INTEGRATION:-1}"
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

sync_local_source() {
  local source_dir
  source_dir="$(cd "$RPH_LOCAL_SOURCE_DIR" && pwd)"
  local install_dir
  install_dir="$(mkdir -p "$(dirname "$RPH_INSTALL_DIR")" && cd "$(dirname "$RPH_INSTALL_DIR")" && pwd)/$(basename "$RPH_INSTALL_DIR")"
  if [ "$source_dir" = "$install_dir" ]; then
    fail "RPH_LOCAL_SOURCE_DIR must not equal RPH_INSTALL_DIR"
  fi
  [ -f "$source_dir/install.sh" ] || fail "RPH_LOCAL_SOURCE_DIR is missing install.sh: $source_dir"
  [ -f "$source_dir/package.json" ] || fail "RPH_LOCAL_SOURCE_DIR is missing package.json: $source_dir"
  info "syncing local source $source_dir -> $RPH_INSTALL_DIR"
  mkdir -p "$RPH_INSTALL_DIR"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude node_modules \
      --exclude dist \
      --exclude .turbo \
      --exclude .rph \
      "$source_dir/" "$RPH_INSTALL_DIR/"
  else
    rm -rf "$RPH_INSTALL_DIR"
    mkdir -p "$RPH_INSTALL_DIR"
    (cd "$source_dir" && tar \
      --exclude node_modules \
      --exclude dist \
      --exclude .turbo \
      --exclude .rph \
      -cf - .) | (cd "$RPH_INSTALL_DIR" && tar -xf -)
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

if [ -n "$RPH_LOCAL_SOURCE_DIR" ]; then
  sync_local_source
elif [ -d "$RPH_INSTALL_DIR/.git" ]; then
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

rph_enable_slash_commands() {
  if [ -z "\${BASH_VERSION:-}" ] && [ -z "\${ZSH_VERSION:-}" ]; then
    printf '%s\n' "[rph] slash helpers require bash or zsh; skipping." >&2
    return 1
  fi

  eval '
function /pm() { command rph /pm "\$@"; }
function /pd() { command rph /pd "\$@"; }
function /setup() { command rph /setup "\$@"; }
function /status() { command rph /status "\$@"; }
function /workspace() { command rph /workspace "\$@"; }
function /next() { command rph /next "\$@"; }
function /qa() { command rph /qa "\$@"; }
function /fe() { command rph /fe "\$@"; }
function /be() { command rph /be "\$@"; }
function /ai() { command rph /ai "\$@"; }
function /mcp() { command rph /mcp "\$@"; }
function /docs() { command rph /docs "\$@"; }
function /github() { command rph /github "\$@"; }
function /notion() { command rph /notion "\$@"; }
function /agent() { command rph /agent "\$@"; }
function /productize() { command rph /productize "\$@"; }
function /doctor() { command rph /doctor "\$@"; }
function /help() { command rph /help "\$@"; }
'
}

rph_disable_slash_commands() {
  unset -f /pm /pd /setup /status /workspace /next /qa /fe /be /ai /mcp /docs /github /notion /agent /productize /doctor /help 2>/dev/null || true
}

if [ "\${RPH_ENABLE_SLASH_COMMANDS:-1}" = "1" ]; then
  rph_enable_slash_commands
fi

if [ -n "\${BASH_VERSION:-}" ]; then
  _rph_bash_complete() {
    local cur="\${COMP_WORDS[COMP_CWORD]}"
    local command="\${COMP_WORDS[1]:-}"
    local words="help version update shell runtime init status workspace next pause resume cancel setup settings ask agent chat ai mcp doctor productize pm pd fe be qa notion docs github"
    local subcommands=""
    if [ "\$COMP_CWORD" -gt 1 ]; then
      case "\$command" in
        setup) subcommands="auto repair detect apply check ai mcp custom" ;;
        doctor) subcommands="status install shell" ;;
        agent) subcommands="status roles catalog discover search import install use activate session journal replay handoffs actions action-approvals lanes run continue recover pool worker claim heartbeat ack complete dead-letter approve-action reject-action clear reset" ;;
        ai) subcommands="status test enable disable run" ;;
        mcp) subcommands="status tools call test enable disable" ;;
        pm) subcommands="start interview draft revise approve diff rollback finalize" ;;
        pd) subcommands="start references directions landing-preview design-system pages show revise approve export finalize" ;;
        fe) subcommands="spec approve sprint-plan issue-create work pr" ;;
        be) subcommands="spec api-contract approve sprint-plan issue-create work deploy-dev pr" ;;
        qa) subcommands="review conflicts test security accessibility report" ;;
        notion) subcommands="plan setup sync" ;;
        docs) subcommands="list show diff rollback approve export" ;;
        github) subcommands="create-repo setup-labels setup-templates setup-branches create-issue create-pr sync release-plan release-approve hotfix-plan" ;;
      esac
    fi
    COMPREPLY=( \$(compgen -W "\${subcommands:-\$words}" -- "\$cur") )
  }
  complete -F _rph_bash_complete rph 2>/dev/null || true
fi

if [ -n "\${ZSH_VERSION:-}" ] && [ -f "$completion_file" ]; then
  autoload -Uz compinit 2>/dev/null || true
  compinit -i 2>/dev/null || true
  source "$completion_file" 2>/dev/null || true
fi
EOF

cat > "$completion_file" <<'EOF'
#compdef rph
_rph() {
  local -a commands setup_cmds doctor_cmds agent_cmds ai_cmds mcp_cmds pm_cmds pd_cmds fe_cmds be_cmds qa_cmds notion_cmds docs_cmds github_cmds
  commands=(
    help version update shell runtime init status workspace next pause resume cancel setup settings
    ask agent chat ai mcp doctor productize pm pd fe be qa notion docs github
  )
  setup_cmds=(auto repair detect apply check ai mcp custom)
  doctor_cmds=(status install shell)
  agent_cmds=(status roles catalog discover search import install use activate session journal replay handoffs actions action-approvals lanes run continue recover pool worker claim heartbeat ack complete dead-letter approve-action reject-action clear reset)
  ai_cmds=(status test enable disable run)
  mcp_cmds=(status tools call test enable disable)
  pm_cmds=(start interview draft revise approve diff rollback finalize)
  pd_cmds=(start references directions landing-preview design-system pages show revise approve export finalize)
  fe_cmds=(spec approve sprint-plan issue-create work pr)
  be_cmds=(spec api-contract approve sprint-plan issue-create work deploy-dev pr)
  qa_cmds=(review conflicts test security accessibility report)
  notion_cmds=(plan setup sync)
  docs_cmds=(list show diff rollback approve export)
  github_cmds=(create-repo setup-labels setup-templates setup-branches create-issue create-pr sync release-plan release-approve hotfix-plan)

  if (( CURRENT == 2 )); then
    _describe 'rph command' commands
    return
  fi

  case "$words[2]" in
    setup) _describe 'setup command' setup_cmds ;;
    doctor) _describe 'doctor command' doctor_cmds ;;
    agent) _describe 'agent command' agent_cmds ;;
    ai) _describe 'ai command' ai_cmds ;;
    mcp) _describe 'mcp command' mcp_cmds ;;
    pm) _describe 'pm command' pm_cmds ;;
    pd) _describe 'pd command' pd_cmds ;;
    fe) _describe 'fe command' fe_cmds ;;
    be) _describe 'be command' be_cmds ;;
    qa) _describe 'qa command' qa_cmds ;;
    notion) _describe 'notion command' notion_cmds ;;
    docs) _describe 'docs command' docs_cmds ;;
    github) _describe 'github command' github_cmds ;;
    *) _describe 'rph command' commands ;;
  esac
}
_rph "$@"
EOF

install_shell_profile_hook() {
  if [ "$RPH_AUTO_SHELL_INTEGRATION" = "0" ]; then
    info "shell profile integration skipped (RPH_AUTO_SHELL_INTEGRATION=0)"
    return
  fi

  local profile=""
  case "${SHELL:-}" in
    */zsh) profile="$HOME/.zshrc" ;;
    */bash) profile="$HOME/.bashrc" ;;
  esac
  if [ -z "$profile" ]; then
    if [ -f "$HOME/.zshrc" ]; then
      profile="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
      profile="$HOME/.bashrc"
    else
      profile="$HOME/.zshrc"
    fi
  fi

  mkdir -p "$(dirname "$profile")"
  touch "$profile"
  if grep -Fq "# >>> rph init >>>" "$profile"; then
    info "shell profile already contains rph init block: $profile"
    return
  fi
  cat >> "$profile" <<EOF

# >>> rph init >>>
export RPH_ENABLE_SLASH_COMMANDS="\${RPH_ENABLE_SLASH_COMMANDS:-1}"
source "$init_file"
# <<< rph init <<<
EOF
  success "shell profile updated: $profile"
}

"$wrapper" help >/dev/null
install_shell_profile_hook

success "installed: $wrapper"
success "shell bootstrap: $init_file"
success "zsh completion: $completion_file"
success "diagnose install: rph doctor install"
success "diagnose shell: rph doctor shell"
success "operator json: rph workspace --json"
success "update: rph update"
case ":$PATH:" in
  *":$RPH_BIN_DIR:"*) ;;
  *)
    info "add this to your shell profile if rph is not found:"
    info "export PATH=\"$RPH_BIN_DIR:\$PATH\""
    ;;
esac
info "current shell activation:"
info "source \"$init_file\""
info "disable automatic profile integration on install: RPH_AUTO_SHELL_INTEGRATION=0"

success "try: rph"
success "one-shot: rph pm start"
success "slash helper: /pm start"
info "if this shell has not sourced RPH yet: source \"$init_file\""
info "inside runtime: /init --yes --project-name \"My Product\""
