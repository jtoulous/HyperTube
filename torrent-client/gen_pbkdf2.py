#!/usr/bin/env python3
"""Generate a qBittorrent PBKDF2 password hash from a plaintext password."""
import hashlib, os, base64, sys

password = sys.argv[1] if len(sys.argv) > 1 else "adminadmin"
salt = os.urandom(16)
key = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, 100000, dklen=64)
print(f'"@ByteArray({base64.b64encode(salt).decode()}:{base64.b64encode(key).decode()})"')
