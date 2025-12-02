"""
시스템 관리 API
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import socket
import subprocess
import platform

router = APIRouter()


class PortInfo(BaseModel):
    port: int
    available: bool


class RestartInfo(BaseModel):
    new_port: int
    message: str


def find_available_port(start_port: int = 8000, end_port: int = 9000) -> int:
    """비어있는 포트 찾기"""
    for port in range(start_port, end_port):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"No available ports found between {start_port} and {end_port}")


def is_port_available(port: int) -> bool:
    """포트가 사용 가능한지 확인"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('127.0.0.1', port))
            return True
    except OSError:
        return False


@router.get("/find-port", response_model=PortInfo)
async def find_port():
    """비어있는 포트 찾기"""
    try:
        available_port = find_available_port()
        return PortInfo(port=available_port, available=True)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check-port/{port}", response_model=PortInfo)
async def check_port(port: int):
    """특정 포트가 사용 가능한지 확인"""
    available = is_port_available(port)
    return PortInfo(port=port, available=available)


@router.post("/restart", response_model=RestartInfo)
async def restart_server():
    """
    서버를 새로운 포트로 재시작

    주의: 이 엔드포인트는 개발 환경에서만 사용해야 합니다.
    실제 프로덕션에서는 프로세스 매니저(PM2, systemd 등)를 사용하세요.
    """
    try:
        # 비어있는 포트 찾기
        new_port = find_available_port()

        # 새 포트 정보 반환 (실제 재시작은 클라이언트에서 처리)
        return RestartInfo(
            new_port=new_port,
            message=f"Available port found: {new_port}. Please restart the server manually."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system-info")
async def get_system_info():
    """시스템 정보 조회"""
    return {
        "platform": platform.system(),
        "platform_version": platform.version(),
        "python_version": platform.python_version(),
    }
