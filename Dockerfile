FROM node:20-slim

# Install required tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (IMPORTANT!)
RUN useradd -m -s /bin/bash claude && \
    echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Switch to non-root user
USER claude
WORKDIR /home/claude/workspace

# Default command
CMD ["bash"]
