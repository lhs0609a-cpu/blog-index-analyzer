"""
Test script for Learning Engine API

Run after starting the server:
    python standalone_server.py
    python test_api.py
"""
import requests
import json
import time

BASE_URL = "http://localhost:8001"

def print_json(data):
    print(json.dumps(data, indent=2, ensure_ascii=False))

def test_health():
    print("\n=== 1. Health Check ===")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print_json(response.json())

def test_get_status():
    print("\n=== 2. Get Learning Status ===")
    response = requests.get(f"{BASE_URL}/api/learning/status")
    print(f"Status: {response.status_code}")
    print_json(response.json())

def test_collect_data():
    print("\n=== 3. Collect Learning Data (1 sample - should trigger auto-learning) ===")
    data = {
        "keyword": "테스트키워드",
        "search_results": [
            {
                "blog_id": "test123",
                "actual_rank": 1,
                "blog_features": {
                    "c_rank_score": 45.5,
                    "dia_score": 46.8,
                    "post_count": 350,
                    "neighbor_count": 450,
                    "visitor_count": 5000
                }
            }
        ]
    }

    response = requests.post(
        f"{BASE_URL}/api/learning/collect",
        json=data
    )
    print(f"Status: {response.status_code}")
    print_json(response.json())

    # Check if learning was triggered
    result = response.json()
    if result.get("learning_triggered"):
        print("\n✅ 자동 학습이 실행되었습니다!")
        print(f"   - 샘플 수: {result.get('total_samples')}")
        if result.get("training_info"):
            info = result["training_info"]
            print(f"   - 정확도 향상: {info['initial_accuracy']:.1f}% → {info['final_accuracy']:.1f}%")
            print(f"   - 소요 시간: {info['duration_seconds']:.2f}초")

def test_get_history():
    print("\n=== 4. Get Training History ===")
    response = requests.get(f"{BASE_URL}/api/learning/history?limit=5")
    print(f"Status: {response.status_code}")
    data = response.json()
    sessions = data.get("sessions", [])
    print(f"Total sessions: {len(sessions)}")
    if sessions:
        print("\nRecent sessions:")
        for session in sessions[:3]:
            print(f"  - Session {session.get('session_id')}")
            print(f"    Samples: {session.get('samples_used')}")
            print(f"    Accuracy: {session.get('accuracy_before'):.1f}% → {session.get('accuracy_after'):.1f}%")

def test_manual_training():
    print("\n=== 5. Manual Training ===")
    data = {
        "batch_size": 10,
        "learning_rate": 0.01,
        "epochs": 20
    }

    response = requests.post(
        f"{BASE_URL}/api/learning/train",
        json=data
    )

    if response.status_code == 200:
        print(f"Status: {response.status_code}")
        result = response.json()
        print(f"✅ 학습 완료!")
        print(f"   - Session ID: {result.get('session_id')}")
        print(f"   - 정확도: {result.get('initial_accuracy'):.1f}% → {result.get('final_accuracy'):.1f}%")
        print(f"   - 향상도: {result.get('improvement'):.1f}%")
        print(f"   - 소요 시간: {result.get('duration_seconds'):.2f}초")
    else:
        print(f"Status: {response.status_code}")
        print_json(response.json())

def test_get_samples():
    print("\n=== 6. Get Learning Samples ===")
    response = requests.get(f"{BASE_URL}/api/learning/samples?limit=5")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Total samples: {data.get('total')}")
    if data.get('samples'):
        print("\nRecent samples:")
        for sample in data['samples'][:3]:
            print(f"  - Keyword: {sample.get('keyword')}, Rank: {sample.get('actual_rank')}")

def main():
    print("==============================================")
    print("  Learning Engine API Test")
    print("==============================================")

    try:
        test_health()
        time.sleep(0.5)

        test_get_status()
        time.sleep(0.5)

        test_collect_data()
        time.sleep(1)

        test_get_status()
        time.sleep(0.5)

        test_get_history()
        time.sleep(0.5)

        test_get_samples()

        print("\n==============================================")
        print("  ✅ All tests completed!")
        print("==============================================")

    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Cannot connect to server")
        print("Please make sure the server is running:")
        print("  python standalone_server.py")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
