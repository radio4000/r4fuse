.PHONY: help install mount unmount test clean dev check-deps

# Default paths
MOUNT_POINT ?= $(HOME)/mnt/radio4000
DOWNLOAD_DIR ?= $(HOME)/Music/radio4000

help: ## Show this help message
	@echo "r4fuse - Radio4000 FUSE Filesystem"
	@echo "=================================="
	@echo ""
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Paths:"
	@echo "  Mount point:  $(MOUNT_POINT)"
	@echo "  Download dir: $(DOWNLOAD_DIR)"
	@echo ""
	@echo "Configuration:"
	@echo "  Location:  ~/.config/r4fuse/"
	@echo "  Files:"
	@echo "    settings.json   - All settings (downloader, paths, features)"
	@echo "    favorites.txt   - Favorite channels (one slug per line)"
	@echo "    downloads.txt   - Auto-download channels (one slug per line)"
	@echo ""
	@echo "Managing Channels:"
	@echo "  Favorites:  Edit ~/.config/r4fuse/favorites.txt"
	@echo "              Add one channel slug per line (e.g., 'oskar')"
	@echo "              Access via: $(MOUNT_POINT)/favorites/"
	@echo ""
	@echo "  Downloads:  Edit ~/.config/r4fuse/downloads.txt"
	@echo "              Channels listed here will auto-download on mount"
	@echo "              Files saved to: $(DOWNLOAD_DIR)/"
	@echo ""
	@echo "Track Organization:"
	@echo "  - Mounted channels: Use actual Radio4000 timestamps (sort by date)"
	@echo "  - Downloaded files: Numbered with ID3 tags, organized in tags/ folders"
	@echo ""
	@echo "Quick Start:"
	@echo "  1. make check-deps      # Verify dependencies"
	@echo "  2. make mount           # Mount filesystem"
	@echo "  3. ls $(MOUNT_POINT)/channels/"
	@echo "  4. Press Ctrl+C to unmount and stop downloads"
	@echo ""
	@echo "For more info, see README.md or cat $(MOUNT_POINT)/HELP.txt"

install: ## Install dependencies
	npm install

check-deps: ## Check if required dependencies are installed
	@echo "Checking dependencies..."
	@command -v node >/dev/null 2>&1 || { echo "✗ Node.js not found"; exit 1; }
	@echo "✓ Node.js: $$(node --version)"
	@command -v npm >/dev/null 2>&1 || { echo "✗ npm not found"; exit 1; }
	@echo "✓ npm: $$(npm --version)"
	@command -v fusermount >/dev/null 2>&1 || { echo "✗ fusermount not found (install fuse)"; exit 1; }
	@echo "✓ fusermount available"
	@command -v yt-dlp >/dev/null 2>&1 || { echo "⚠ yt-dlp not found (downloads won't work)"; }
	@command -v yt-dlp >/dev/null 2>&1 && echo "✓ yt-dlp: $$(yt-dlp --version)" || true
	@echo "✓ All required dependencies installed"

mount: check-deps ## Mount the filesystem
	@mkdir -p $(MOUNT_POINT)
	@if mountpoint -q $(MOUNT_POINT); then \
		echo "Already mounted at $(MOUNT_POINT)"; \
	else \
		node bin/r4fuse.js mount; \
	fi

unmount: ## Unmount the filesystem
	@if mountpoint -q $(MOUNT_POINT); then \
		fusermount -u $(MOUNT_POINT) && echo "✓ Unmounted $(MOUNT_POINT)"; \
	else \
		echo "Not mounted"; \
	fi

remount: unmount mount ## Unmount and remount

dev: ## Mount in development mode (shows errors)
	@mkdir -p $(MOUNT_POINT)
	@killall node 2>/dev/null || true
	@fusermount -u $(MOUNT_POINT) 2>/dev/null || true
	@sleep 1
	@node bin/r4fuse.js mount

test: ## Run tests
	npm test

test-mount: ## Test basic mount operations
	@echo "Testing mount..."
	@mkdir -p $(MOUNT_POINT)
	@killall node 2>/dev/null || true
	@fusermount -u $(MOUNT_POINT) 2>/dev/null || true
	@sleep 1
	@node bin/r4fuse.js mount > /tmp/r4fuse-test.log 2>&1 &
	@sleep 3
	@echo "Checking if mounted..."
	@ls $(MOUNT_POINT)/ > /dev/null && echo "✓ Mount successful" || (echo "✗ Mount failed"; cat /tmp/r4fuse-test.log; exit 1)
	@echo "Testing directory listing..."
	@ls $(MOUNT_POINT)/channels/ | head -5
	@echo "✓ Test passed"
	@fusermount -u $(MOUNT_POINT) 2>/dev/null || true

clean: unmount ## Clean cache and temporary files
	rm -rf ~/.cache/r4fuse
	rm -f /tmp/r4fuse*.log
	@echo "✓ Cleaned cache and logs"

clean-all: clean ## Clean everything including downloads
	@read -p "Delete all downloaded files in $(DOWNLOAD_DIR)? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -rf $(DOWNLOAD_DIR); \
		echo "✓ Deleted downloads"; \
	fi

status: ## Show filesystem status
	@echo "r4fuse Status"
	@echo "============="
	@if mountpoint -q $(MOUNT_POINT); then \
		echo "Status: Mounted"; \
		echo "Mount point: $(MOUNT_POINT)"; \
		echo "Process: $$(ps aux | grep 'r4fuse.js mount' | grep -v grep | awk '{print $$2}')"; \
	else \
		echo "Status: Not mounted"; \
	fi
	@echo ""
	@echo "Preferences:"
	@if [ -f ~/.config/r4fuse/preferences.json ]; then \
		echo "  Favorites: $$(cat ~/.config/r4fuse/preferences.json | grep -o '"favorites":\[[^]]*\]' | grep -o '"[^"]*"' | wc -l)"; \
		echo "  Auto-sync: $$(cat ~/.config/r4fuse/preferences.json | grep -o '"autoSync":\[[^]]*\]' | grep -o '"[^"]*"' | wc -l)"; \
	else \
		echo "  No preferences file"; \
	fi
	@echo ""
	@echo "Downloads:"
	@if [ -d $(DOWNLOAD_DIR) ]; then \
		echo "  Channels: $$(ls -1 $(DOWNLOAD_DIR) 2>/dev/null | wc -l)"; \
		echo "  Location: $(DOWNLOAD_DIR)"; \
	else \
		echo "  No downloads yet"; \
	fi

logs: ## Show recent logs
	@if [ -f /tmp/r4fuse-test.log ]; then \
		tail -50 /tmp/r4fuse-test.log; \
	else \
		echo "No logs found"; \
	fi
