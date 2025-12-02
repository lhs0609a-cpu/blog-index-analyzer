# -*- coding: utf-8 -*-
"""Simple test script for PyInstaller"""
import sys
import os

print("Test EXE is running!")
print(f"Python version: {sys.version}")
print(f"Frozen: {getattr(sys, 'frozen', False)}")

if getattr(sys, 'frozen', False):
    print(f"MEIPASS: {sys._MEIPASS}")

print("\nPress Enter to exit...")
input()
