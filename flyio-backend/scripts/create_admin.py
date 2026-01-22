"""
Create admin user script
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from passlib.context import CryptContext
from database.user_db import get_user_db

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_admin_user(email: str, password: str, name: str = None):
    """Create admin user"""
    user_db = get_user_db()

    # Check if user already exists
    existing_user = user_db.get_user_by_email(email)

    if existing_user:
        print(f"User {email} already exists. Updating to admin...")
        # Update password and set as admin
        hashed_password = pwd_context.hash(password)
        user_db.set_admin(existing_user["id"], True)
        user_db.update_user(
            existing_user["id"],
            hashed_password=hashed_password,
            plan="business",
            is_premium_granted=1
        )
        print(f"User {email} is now an admin with business plan!")
        print(f"Password has been updated.")
        return existing_user["id"]

    # Create new user
    hashed_password = pwd_context.hash(password)
    user_id = user_db.create_user(
        email=email,
        hashed_password=hashed_password,
        name=name or "관리자"
    )

    # Set as admin with business plan
    user_db.set_admin(user_id, True)
    user_db.update_user(user_id, plan="business", is_premium_granted=1)

    print(f"Admin user created successfully!")
    print(f"  ID: {user_id}")
    print(f"  Email: {email}")
    print(f"  Plan: business")
    print(f"  is_admin: True")

    return user_id


if __name__ == "__main__":
    # Create admin account
    admin_email = "lhs0609c@naver.com"
    admin_password = "lhs0609c@naver.com"

    create_admin_user(admin_email, admin_password, "관리자")
