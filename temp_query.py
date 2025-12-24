import sqlite3
c = sqlite3.connect("/app/data/blog_analyzer.db")
for r in c.execute("SELECT id,email,name,is_admin FROM users"):
    print(r)
