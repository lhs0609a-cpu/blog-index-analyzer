#!/usr/bin/env python3
"""
Update main.py to include learning router
"""

# Read main.py
with open('/app/main.py', 'r') as f:
    content = f.read()

# Check if learning is already imported
if 'from routers import' in content and ', learning' not in content:
    # Add learning to imports
    content = content.replace(
        'from routers import auth, blogs, comprehensive_analysis, system',
        'from routers import auth, blogs, comprehensive_analysis, system, learning'
    )
    print('[1/2] Added learning to imports')
else:
    print('[1/2] Learning already in imports')

# Check if learning router is already registered
if 'include_router(learning.router' not in content:
    # Add learning router registration after system router
    content = content.replace(
        'app.include_router(system.router, prefix="/api/system", tags=["시스템"])',
        'app.include_router(system.router, prefix="/api/system", tags=["시스템"])\napp.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])'
    )
    print('[2/2] Added learning router registration')
else:
    print('[2/2] Learning router already registered')

# Write back
with open('/app/main.py', 'w') as f:
    f.write(content)

print('\nSuccess! main.py updated.')
print('Now restart the app with: supervisorctl restart all')
