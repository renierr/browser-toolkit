#!/bin/bash

# Configuration
REMOTE_NAME="upstream"
REMOTE_URL="https://github.com/renierr/vanilla-toolkit-base.git"
UPSTREAM_BRANCH="main"
SYNC_COMMIT_PREFIX="~SyncTemplateMarker~:"

# Enable rerere
git config rerere.enabled true
echo "git rerere enabled (reuses conflict resolutions)."

# Add remote if missing
if ! git remote get-url "$REMOTE_NAME" > /dev/null 2>&1; then
    git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

# Fetch latest
git fetch "$REMOTE_NAME"

UPSTREAM_HEAD=$(git rev-parse "$REMOTE_NAME/$UPSTREAM_BRANCH")
UPSTREAM_SHORT=$(git rev-parse --short "$REMOTE_NAME/$UPSTREAM_BRANCH")

# Find last synced upstream commit from git log
LAST_SYNCED=$(git log --grep="^${SYNC_COMMIT_PREFIX}" -1 --pretty=format:%B | head -1 | grep -o '[0-9a-f]\{40\}' || echo "")

resolve_remaining_conflicts() {
    echo "--- !!! CONFLICTS REMAIN !!! ---"
    echo "Manually review/edit conflicted files (look for <<<<<<< markers)."
    echo "Then stage resolved files: git add <file>"
    echo "Press ENTER when ready to commit..."
    read -r
}

if [ -z "$LAST_SYNCED" ]; then
    # First sync: full squash merge
    echo "--- First sync: squash merging full template (up to ${UPSTREAM_SHORT}) ---"
    git merge --squash --allow-unrelated-histories "$REMOTE_NAME/$UPSTREAM_BRANCH"

    # Check for lingering unmerged files
    if git status --porcelain | grep -q '^UU '; then
        resolve_remaining_conflicts
    else
        echo "Merge completed (all conflicts auto-resolved by rerere or none existed)."
    fi

    # Always create a commit for the initial sync
    git commit --allow-empty -m "${SYNC_COMMIT_PREFIX}${UPSTREAM_HEAD}

Initial full sync from template repository.
Template commit: ${UPSTREAM_HEAD}

Note: --allow-empty used if template changes resulted in no net differences."
    echo "Initial sync committed (marker created)."

else
    # Subsequent: incremental patch
    echo "--- Incremental sync from ${LAST_SYNCED:0:7} to ${UPSTREAM_SHORT} ---"

    PATCH=$(git diff "${LAST_SYNCED}^{tree}" "$REMOTE_NAME/$UPSTREAM_BRANCH^{tree}")
    if [ -z "$PATCH" ]; then
        echo "No new changes from template (already up-to-date with ${UPSTREAM_SHORT})."
        exit 0
    fi

    echo "$PATCH" | git apply --index -3
    APPLY_EXIT=$?

    if [ $APPLY_EXIT -ne 0 ] || git status --porcelain | grep -q '^UU '; then
        resolve_remaining_conflicts
    else
        echo "Patch applied (all conflicts auto-resolved by rerere or none existed)."
    fi

    # Commit if changes or allow-empty for marker (optional)
    if ! git diff --cached --quiet; then
        git commit -m "${SYNC_COMMIT_PREFIX}${UPSTREAM_HEAD}

Incremental update from template repository.
Changes since last sync (${LAST_SYNCED:0:7}).
Template commit: ${UPSTREAM_HEAD}"
        echo "Incremental changes committed."
    else
        echo "No net changes from template. Nothing committed."
        # Uncomment below if you want a marker commit even when up-to-date:
        # git commit --allow-empty -m "${SYNC_COMMIT_PREFIX}${UPSTREAM_HEAD}
        #
        #No new changes (up-to-date check).
        #Template commit: ${UPSTREAM_HEAD}"
        # echo "Marker commit created for up-to-date sync."
    fi
fi

echo "--- ✅ Sync complete! Template at ${UPSTREAM_SHORT} (${UPSTREAM_HEAD}) ---"
# Optional push:
# git push origin $(git rev-parse --abbrev-ref HEAD)
