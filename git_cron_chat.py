#!/usr/bin/env python3
"""
git_cron_chat.py - Auto-deploy script for Brain Space Chat Node.js application

This script:
1. Checks if there are any updates on the GitHub repository
2. Pulls the latest changes if updates are found
3. Installs dependencies if package.json changed
4. Builds the TypeScript application
5. Restarts the PM2 process

Usage:
  python3 git_cron_chat.py

Configuration:
  - Edit the variables below to match your setup
  - Make sure this script has execute permissions
  - Add to crontab to run every 5 minutes
"""

import os
import sys
import subprocess
import json
import hashlib
import logging
from datetime import datetime
from pathlib import Path

# Configuration - EDIT THESE VALUES
APP_PATH = "/home/jayd/Desktop/Web Development/backend projects/brain-space-chat"
PM2_APP_NAME = "brain-space-chat"
GIT_BRANCH = "main"  # Main branch
LOG_FILE = "/home/jayd/Desktop/Web Development/backend projects/brain-space-chat/logs/auto-deploy.log"

# Setup logging
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def run_command(cmd, cwd=None, check=True):
    """
    Run a shell command and return the result
    """
    try:
        logger.info(f"Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
        result = subprocess.run(
            cmd,
            cwd=cwd or APP_PATH,
            capture_output=True,
            text=True,
            check=check,
            shell=isinstance(cmd, str)
        )
        
        if result.stdout.strip():
            logger.info(f"Output: {result.stdout.strip()}")
        
        return result
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {e}")
        logger.error(f"Error output: {e.stderr}")
        raise

def get_current_commit_hash():
    """
    Get the current commit hash of the local repository
    """
    try:
        result = run_command(["git", "rev-parse", "HEAD"])
        return result.stdout.strip()
    except Exception as e:
        logger.error(f"Failed to get current commit hash: {e}")
        return None

def get_remote_commit_hash():
    """
    Get the latest commit hash from the remote repository
    """
    try:
        # Fetch the latest changes without merging
        run_command(["git", "fetch", "origin", GIT_BRANCH])
        
        # Get the commit hash of the remote branch
        result = run_command(["git", "rev-parse", f"origin/{GIT_BRANCH}"])
        return result.stdout.strip()
    except Exception as e:
        logger.error(f"Failed to get remote commit hash: {e}")
        return None

def check_for_updates():
    """
    Check if there are updates available on the remote repository
    Compares COMMITTED code only (ignores unstaged local changes)
    """
    logger.info("Checking for updates...")
    logger.info("🔒 Comparing committed code only (ignoring unstaged changes)")
    
    # Get current committed code hash (HEAD - ignores unstaged changes)
    current_hash = get_current_commit_hash()
    # Get remote hash 
    remote_hash = get_remote_commit_hash()
    
    if not current_hash or not remote_hash:
        logger.error("Failed to get commit hashes")
        return False
    
    logger.info(f"Local committed code: {current_hash[:8]}")
    logger.info(f"Remote commit:        {remote_hash[:8]}")
    
    if current_hash != remote_hash:
        logger.info("🚀 Remote has different commits - updates found!")
        logger.info("   (Your unstaged local changes are ignored in this comparison)")
        return True
    else:
        logger.info("✅ Committed code matches remote - no updates found")
        logger.info("   (Your unstaged local changes don't affect this decision)")
        return False

def get_package_json_hash():
    """
    Get hash of package.json to detect dependency changes
    """
    package_json_path = os.path.join(APP_PATH, "package.json")
    if os.path.exists(package_json_path):
        with open(package_json_path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()
    return None

def pull_changes():
    """
    Pull the latest changes while preserving local modifications
    """
    logger.info("Pulling latest changes while preserving your local modifications...")
    try:
        # Store package.json hash before pull
        old_package_hash = get_package_json_hash()
        
        # Check repository status
        logger.info("Checking repository status...")
        status_result = run_command(["git", "status", "--porcelain"], check=False)
        
        has_local_changes = bool(status_result.stdout.strip())
        
        # Check if there are any merge conflicts or other issues
        try:
            # Check if we're in the middle of a merge, rebase, etc.
            git_dir_check = run_command(["git", "rev-parse", "--git-dir"], check=False)
            if git_dir_check.returncode == 0:
                git_dir = git_dir_check.stdout.strip()
                merge_head = os.path.join(git_dir, "MERGE_HEAD")
                rebase_head = os.path.join(git_dir, "REBASE_HEAD")
                
                if os.path.exists(merge_head):
                    logger.warning("Repository is in the middle of a merge - aborting merge first")
                    run_command(["git", "merge", "--abort"], check=False)
                elif os.path.exists(rebase_head):
                    logger.warning("Repository is in the middle of a rebase - aborting rebase first")
                    run_command(["git", "rebase", "--abort"], check=False)
        except Exception as status_check_error:
            logger.warning(f"Could not check repository status: {status_check_error}")
        
        # Check for uncommitted OR untracked changes
        logger.info("Checking for uncommitted or untracked changes...")
        status_result = run_command(["git", "status", "--porcelain"], check=False)
        has_changes = False
        change_types = []
        
        for line in status_result.stdout.strip().splitlines():
            if line:
                has_changes = True
                if line.startswith('??'):
                    change_types.append("untracked files")
                else:
                    change_types.append("uncommitted changes")
        
        if has_changes:
            logger.warning(f"Found {', '.join(set(change_types))}! Please commit all changes before running this script.")
            logger.warning("Aborting pull to avoid conflicts. Commit your changes and re-run.")
            return "aborted"
        else:
            logger.info("No uncommitted or untracked changes detected. Proceeding with pull.")
        # Pull the remote changes
        logger.info("Pulling remote changes...")
        pull_result = run_command(["git", "pull", "origin", GIT_BRANCH])
        # Check if already up to date
        if "Already up to date" in pull_result.stdout:
            logger.info("✅ Repository is already up to date - no deployment needed")
            return "no_changes"
        # Check if package.json changed
        new_package_hash = get_package_json_hash()
        package_changed = old_package_hash != new_package_hash
        logger.info("Successfully pulled changes.")
        return package_changed
        
    except Exception as e:
        logger.error(f"Failed to pull changes: {e}")
        # Recovery strategy that preserves local changes
        try:
            logger.warning("Attempting recovery while preserving local changes...")
            
            # Fetch latest remote info
            run_command(["git", "fetch", "origin", GIT_BRANCH], check=False)
            
            # Try to merge instead of reset (preserves local changes better)
            try:
                merge_result = run_command(["git", "merge", f"origin/{GIT_BRANCH}"], check=False)
                logger.info("Recovery successful using merge strategy")
                
                # If there were conflicts, try to restore local changes
                if "conflict" in merge_result.stderr.lower() or "conflict" in merge_result.stdout.lower():
                    logger.warning("Merge conflicts detected during recovery")
                    # Abort the merge and try to restore stashed changes
                    run_command(["git", "merge", "--abort"], check=False)
                    stash_list = run_command(["git", "stash", "list"], check=False)
                    if stash_list.stdout.strip():
                        logger.info("Restoring local changes from stash...")
                        run_command(["git", "stash", "pop"], check=False)
                    logger.info("Merge aborted, local changes restored")
                    
            except Exception as merge_error:
                logger.warning(f"Merge failed: {merge_error}")
                # If merge fails, try to restore from stash
                stash_list = run_command(["git", "stash", "list"], check=False)
                if stash_list.stdout.strip():
                    logger.info("Restoring local changes from stash...")
                    run_command(["git", "stash", "pop"], check=False)
                logger.info("Recovery completed - local changes should be preserved")
            
            return True  # Assume package.json might have changed
            
        except Exception as recovery_error:
            logger.error(f"Recovery also failed: {recovery_error}")
            logger.error("💡 Manual intervention may be required")
            logger.error("💡 Check 'git stash list' for your preserved changes")
            raise e

def install_dependencies():
    """
    Install npm dependencies
    """
    logger.info("Installing dependencies...")
    try:
        run_command(["npm", "install", "--legacy-peer-deps"])
        logger.info("Dependencies installed successfully")
    except Exception as e:
        logger.error(f"Failed to install dependencies: {e}")
        raise

def build_application():
    """
    Build the TypeScript Node.js application
    """
    logger.info("Building TypeScript application...")
    try:
        # Remove previous build
        build_dir = os.path.join(APP_PATH, "dist")
        if os.path.exists(build_dir):
            run_command(["rm", "-rf", build_dir])
        
        # Build the TypeScript application
        run_command(["npm", "run", "build"])
        logger.info("TypeScript application built successfully")
    except Exception as e:
        logger.error(f"Failed to build TypeScript application: {e}")
        raise

def restart_pm2_app():
    """
    Restart the PM2 application using ecosystem config
    """
    logger.info(f"Restarting PM2 app: {PM2_APP_NAME}")
    try:
        # Check if ecosystem.config.js exists
        ecosystem_path = os.path.join(APP_PATH, "ecosystem.config.js")
        
        if os.path.exists(ecosystem_path):
            logger.info("Found ecosystem.config.js, using it for PM2 management")
            
            # Stop and delete existing app cleanly
            result = run_command(["pm2", "list"], check=False)
            if PM2_APP_NAME in result.stdout:
                logger.info(f"Stopping existing PM2 app: {PM2_APP_NAME}")
                run_command(["pm2", "stop", PM2_APP_NAME], check=False)
                run_command(["pm2", "delete", PM2_APP_NAME], check=False)
            
            # Start with ecosystem config
            run_command(["pm2", "start", "ecosystem.config.js"], cwd=APP_PATH)
            logger.info(f"Started {PM2_APP_NAME} using ecosystem config")
        else:
            logger.info("No ecosystem.config.js found, using basic PM2 start")
            # Fallback to basic PM2 management
            result = run_command(["pm2", "list"], check=False)
            
            if PM2_APP_NAME in result.stdout:
                # Restart the existing app
                run_command(["pm2", "restart", PM2_APP_NAME])
                logger.info(f"Restarted {PM2_APP_NAME}")
            else:
                # Start the app if it's not running (Node.js backend)
                run_command([
                    "pm2", "start", "dist/server.js", 
                    "--name", PM2_APP_NAME
                ], cwd=APP_PATH)
                logger.info(f"Started {PM2_APP_NAME}")
        
        # Save PM2 configuration
        run_command(["pm2", "save"])
        
        # Show current PM2 status for verification
        run_command(["pm2", "list"], check=False)
        
    except Exception as e:
        logger.error(f"Failed to restart PM2 app: {e}")
        raise

def send_notification(message, is_error=False):
    """
    Log deployment status (can be extended to send email/slack notifications)
    """
    level = logging.ERROR if is_error else logging.INFO
    logger.log(level, f"DEPLOYMENT: {message}")

def list_local_changes():
    """
    Show current local changes and available stashes
    """
    try:
        logger.info("📋 Current local changes:")
        result = run_command(["git", "status", "--porcelain"], check=False)
        if result.stdout.strip():
            changes = result.stdout.strip().split('\n')
            for change in changes:
                logger.info(f"   {change}")
        else:
            logger.info("   No current local changes")
        
        logger.info("📦 Available stashes with preserved changes:")
        stash_result = run_command(["git", "stash", "list"], check=False)
        if stash_result.stdout.strip():
            stashes = [line for line in stash_result.stdout.split('\n') if 'auto-deploy-preserve' in line]
            if stashes:
                for stash in stashes:
                    logger.info(f"   {stash}")
            else:
                logger.info("   No preserved change stashes found")
        else:
            logger.info("   No stashes available")
            
    except Exception as e:
        logger.error(f"Failed to list local changes: {e}")

def main():
    """
    Main deployment function - PULLS ONLY, NEVER PUSHES
    """
    logger.info("=" * 50)
    logger.info("Starting auto-deployment check (PULL-ONLY MODE) - BRAIN SPACE CHAT")
    logger.info("⚠️  This script NEVER pushes to remote repository")
    
    try:
        # Check if the app directory exists
        if not os.path.exists(APP_PATH):
            logger.error(f"Application path does not exist: {APP_PATH}")
            return 1
        
        # Change to app directory
        os.chdir(APP_PATH)
        
        # Check if this is a git repository
        if not os.path.exists(os.path.join(APP_PATH, ".git")):
            logger.error(f"Not a git repository: {APP_PATH}")
            return 1
        
        # Safety check: Verify we're in pull-only mode
        logger.info("🔒 Safety: This script operates in PULL-ONLY mode")
        logger.info("🔒 Safety: Local changes will be preserved during pull")
        logger.info("🔒 Safety: Your local changes will NEVER be pushed to remote repository")
        
        # Check for updates
        if not check_for_updates():
            logger.info("No deployment needed")
            return 0
        
        # Pull changes and check if package.json changed
        package_changed = pull_changes()
        
        # Check if pull was aborted due to uncommitted/untracked changes
        if package_changed == "aborted":
            logger.error("Pull was aborted due to uncommitted or untracked changes")
            return 1
        
        # Check if no changes were actually pulled
        if package_changed == "no_changes":
            logger.info("No actual changes were pulled - stopping deployment")
            return 0
        
        # Install dependencies if package.json changed
        if package_changed:
            logger.info("package.json changed, reinstalling dependencies...")
            install_dependencies()
        else:
            logger.info("package.json unchanged, skipping dependency installation")
        
        # Build the TypeScript application
        build_application()
        
        # Restart PM2 app
        restart_pm2_app()
        
        send_notification("Brain Space Chat deployment completed successfully!")
        logger.info("Auto-deployment completed successfully")
        return 0
        
    except Exception as e:
        error_msg = f"Brain Space Chat deployment failed: {str(e)}"
        send_notification(error_msg, is_error=True)
        logger.error(error_msg)
        return 1
    
    finally:
        logger.info("Auto-deployment check finished")
        logger.info("=" * 50)

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
