FROM docker.io/library/ubuntu:24.04

RUN apt-get update && apt-get install -y \
    podman \
    fuse-overlayfs \
    uidmap \
    slirp4netns \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Override the system-wide storage config so that kernel overlay is never
# attempted (fuse-overlayfs is used even if the per-user config isn't picked up).
RUN printf '[storage]\ndriver = "overlay"\n\n[storage.options.overlay]\nmount_program = "/usr/bin/fuse-overlayfs"\nskip_mount_home = "true"\n' \
    > /etc/containers/storage.conf

# Create a non-root user for running Podman rootlessly
RUN useradd -m -s /bin/bash poduser && \
    echo "poduser:100000:65536" >> /etc/subuid && \
    echo "poduser:100000:65536" >> /etc/subgid

# Configure Podman storage to use fuse-overlayfs (required in nested/rootless envs)
RUN mkdir -p /home/poduser/.config/containers
COPY containers.conf /home/poduser/.config/containers/containers.conf
COPY storage.conf    /home/poduser/.config/containers/storage.conf
RUN chown -R poduser:poduser /home/poduser/.config

# Pre-create the mount point so Docker doesn't create it as root
RUN mkdir -p /home/poduser/.local/share/containers && \
    chown -R poduser:poduser /home/poduser/.local

# Entrypoint runs as root briefly to fix tmpfs ownership, then execs as poduser
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /home/poduser

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/bin/bash"]
