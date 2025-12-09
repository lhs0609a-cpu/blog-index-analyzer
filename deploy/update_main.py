"""
Script to update main.py with learning router
"""

main_py_addition = """
# Learning Engine Router
from routers import learning
app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])
"""

print("Add this to main.py after the other router includes:")
print(main_py_addition)

# The complete updated routers section should look like:
"""
# 라우터 등록
from routers import auth, blogs, comprehensive_analysis, system, learning

app.include_router(auth.router, prefix="/api/auth", tags=["인증"])
app.include_router(blogs.router, prefix="/api/blogs", tags=["블로그"])
app.include_router(comprehensive_analysis.router, prefix="/api/comprehensive", tags=["종합분석"])
app.include_router(system.router, prefix="/api/system", tags=["시스템"])
app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])
"""
