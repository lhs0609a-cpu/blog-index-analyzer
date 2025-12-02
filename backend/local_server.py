# -*- coding: utf-8 -*-
"""
Blog Index Analyzer - Local Server
Console application for running local backend server
"""
import sys
import os
import logging
import traceback

print("Starting Blog Index Analyzer...")
print("Setting up paths...")

# PyInstaller path setup
if getattr(sys, 'frozen', False):
    # Running as PyInstaller exe
    BASE_DIR = sys._MEIPASS
    print(f"Running as EXE, BASE_DIR: {BASE_DIR}")
    os.chdir(BASE_DIR)
    # Add BASE_DIR to Python path
    sys.path.insert(0, BASE_DIR)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    print(f"Running as script, BASE_DIR: {BASE_DIR}")

# Environment variables
os.environ.setdefault('APP_ENV', 'local')
os.environ.setdefault('DEBUG', 'false')

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """Main function"""
    print("=" * 50)
    print("  Blog Index Analyzer - Local Server")
    print("=" * 50)
    print()
    print("  Server URL: http://localhost:8001")
    print("  Status: Starting...")
    print()
    print("  Press Ctrl+C to stop the server")
    print("=" * 50)

    try:
        print("Importing uvicorn...")
        import uvicorn
        print("Uvicorn imported successfully")

        print("Importing FastAPI app...")
        from main import app
        print("FastAPI app imported successfully")

        logger.info("Starting Blog Index Analyzer Server on http://localhost:8001")
        print("\nServer is starting on http://localhost:8001")
        print("Please wait...")

        uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")

    except Exception as e:
        print(f"\nERROR: {e}")
        print("\nFull traceback:")
        traceback.print_exc()
        print("\nPress Enter to exit...")
        input()
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"\nFatal error: {e}")
        traceback.print_exc()
        print("\nPress Enter to exit...")
        input()
