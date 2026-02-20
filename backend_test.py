#!/usr/bin/env python3
"""
T'aksi Backend API Testing - Comprehensive Feature Testing
Tests all endpoints and features mentioned in the review request
"""

import requests
import sys
import json
from datetime import datetime, timezone

class TaksiAPITester:
    def __init__(self, base_url="https://upgrade-code.preview.emergentagent.com"):
        self.base_url = base_url.rstrip('/')
        self.api_url = f"{self.base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.rider_token = None
        self.driver_token = None

    def log_test_result(self, name, success, message, endpoint=None, expected_status=None, actual_status=None):
        """Log test result"""
        result = {
            "test": name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        if endpoint:
            result["endpoint"] = endpoint
        if expected_status is not None:
            result["expected_status"] = expected_status
        if actual_status is not None:
            result["actual_status"] = actual_status
            
        self.test_results.append(result)
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        print(f"{'✅' if success else '❌'} {name}: {message}")
        return success

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if endpoint else self.base_url
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, params=params, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, params=params, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                try:
                    response_data = response.json()
                    return self.log_test_result(
                        name, True, 
                        f"Status: {response.status_code}, Response received", 
                        endpoint, expected_status, response.status_code
                    ), response_data
                except:
                    return self.log_test_result(
                        name, True, 
                        f"Status: {response.status_code}, Text response", 
                        endpoint, expected_status, response.status_code
                    ), response.text
            else:
                try:
                    error_data = response.json()
                    return self.log_test_result(
                        name, False, 
                        f"Expected {expected_status}, got {response.status_code}. Error: {error_data.get('detail', error_data)}", 
                        endpoint, expected_status, response.status_code
                    ), error_data
                except:
                    return self.log_test_result(
                        name, False, 
                        f"Expected {expected_status}, got {response.status_code}. Response: {response.text[:100]}", 
                        endpoint, expected_status, response.status_code
                    ), response.text
                
        except requests.exceptions.RequestException as e:
            return self.log_test_result(
                name, False, 
                f"Network Error: {str(e)}", 
                endpoint, expected_status, "Network Error"
            ), {}

    def test_health_check(self):
        """Test API /api/health endpoint"""
        print("\n🏥 TESTING HEALTH CHECK")
        success, response = self.run_test("Health Check", "GET", "health", 200)
        return success

    def test_translate_endpoint(self):
        """Test API /api/translate endpoint"""
        print("\n🌐 TESTING TRANSLATE ENDPOINT")
        
        translate_data = {
            "text": "Hello, how are you?",
            "source_lang": "en", 
            "target_lang": "ka"
        }
        
        success, response = self.run_test("Translate API", "POST", "translate", 200, data=translate_data)
        
        if success and isinstance(response, dict) and "translated_text" in response:
            return self.log_test_result("Translate Response Check", True, "Translation API working correctly")
        elif success:
            return self.log_test_result("Translate Response Check", False, f"Missing 'translated_text' in response: {response}")
        
        return success

    def test_support_message_endpoint(self):
        """Test API /api/support/message endpoint (AI chatbot)"""
        print("\n🤖 TESTING SUPPORT MESSAGE ENDPOINT")
        
        support_data = {
            "message": "How do I book a ride?",
            "user_id": "test_user_123"
        }
        
        success, response = self.run_test("Support Message API", "POST", "support/message", 200, data=support_data)
        
        if success and isinstance(response, dict) and "response" in response:
            return self.log_test_result("Support Response Check", True, "Support chatbot API working correctly")
        elif success:
            return self.log_test_result("Support Response Check", False, f"Missing 'response' in response: {response}")
            
        return success

    def test_rating_tags_endpoint(self):
        """Test API /api/rating/tags endpoint"""
        print("\n⭐ TESTING RATING TAGS ENDPOINT")
        
        success, response = self.run_test("Rating Tags API", "GET", "rating/tags", 200)
        
        if success and isinstance(response, dict) and ("positive" in response or "tags" in response):
            return self.log_test_result("Rating Tags Response Check", True, "Rating tags API working correctly")
        elif success:
            return self.log_test_result("Rating Tags Response Check", False, f"Unexpected rating tags response: {response}")
            
        return success

    def test_registration_and_auth(self):
        """Test user registration and authentication"""
        print("\n👤 TESTING REGISTRATION & AUTH")
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Test Rider Registration
        rider_data = {
            "name": f"TestRider_{timestamp}",
            "surname": "Automated", 
            "cellphone": f"+995555{timestamp[-6:]}",
            "password": "testpass123",
            "email": f"rider_{timestamp}@test.com"
        }
        
        rider_success, rider_response = self.run_test(
            "Rider Registration", 
            "POST", 
            "auth/register/rider", 
            200, 
            data=rider_data
        )
        
        if rider_success and isinstance(rider_response, dict) and "token" in rider_response:
            self.rider_token = rider_response["token"]
        
        # Test Driver Registration
        driver_data = {
            "name": f"TestDriver_{timestamp}",
            "surname": "Automated",
            "cellphone": f"+995556{timestamp[-6:]}",
            "password": "testpass123",
            "email": f"driver_{timestamp}@test.com"
        }
        
        driver_success, driver_response = self.run_test(
            "Driver Registration",
            "POST", 
            "auth/register/driver",
            200,
            data=driver_data
        )
        
        if driver_success and isinstance(driver_response, dict) and "token" in driver_response:
            self.driver_token = driver_response["token"]
        
        # Test Login
        if rider_success:
            login_data = {
                "cellphone": rider_data["cellphone"],
                "password": rider_data["password"]
            }
            login_success, _ = self.run_test("Rider Login", "POST", "auth/login", 200, data=login_data)
        
        return rider_success and driver_success

    def test_sos_endpoints(self):
        """Test SOS related endpoints"""
        print("\n🚨 TESTING SOS ENDPOINTS")
        
        # Test SOS alert creation
        sos_data = {
            "lat": 41.7151,
            "lng": 44.8271,
            "message": "Test emergency alert",
            "ride_id": "test_ride_123"
        }
        
        success, response = self.run_test("SOS Alert Creation", "POST", "sos", 200, data=sos_data)
        
        # Test admin SOS alerts (may require admin auth - expect 401/403)
        admin_success, _ = self.run_test("Admin SOS Active", "GET", "admin/sos/active", 401)
        
        return success

    def test_admin_endpoints(self):
        """Test admin related endpoints"""
        print("\n👑 TESTING ADMIN ENDPOINTS")
        
        # Test admin support tickets (expect 401/403 without auth)
        tickets_success, _ = self.run_test("Admin Support Tickets", "GET", "admin/support/tickets/escalated", 401)
        
        return tickets_success

    def test_ride_features(self):
        """Test ride-related features"""
        print("\n🚗 TESTING RIDE FEATURES")
        
        # Test fare estimation
        estimation_success, estimation_response = self.run_test(
            "Fare Estimation", 
            "GET", 
            "surge/estimate", 
            200, 
            params={
                "car_type": "economy",
                "distance": 5,
                "payment_method": "cash"
            }
        )
        
        # Test surge status
        surge_success, surge_response = self.run_test("Surge Status", "GET", "surge/status", 200)
        
        return estimation_success and surge_success

    def test_frontend_loading(self):
        """Test if frontend loads correctly"""
        print("\n🌐 TESTING FRONTEND LOADING")
        
        try:
            response = requests.get(self.base_url, timeout=10)
            if response.status_code == 200:
                # Check if it contains React app elements
                content = response.text.lower()
                has_react = "react" in content or "div id=\"root\"" in content or "app" in content
                
                success = len(content) > 1000  # Basic check for substantial content
                return self.log_test_result(
                    "Frontend Loading", 
                    success,
                    f"Frontend loaded successfully (Size: {len(content)} chars)" if success else "Frontend response too small"
                )
            else:
                return self.log_test_result(
                    "Frontend Loading", 
                    False, 
                    f"Frontend returned status {response.status_code}"
                )
        except Exception as e:
            return self.log_test_result("Frontend Loading", False, f"Frontend loading failed: {str(e)}")

    def run_comprehensive_tests(self):
        """Run all comprehensive tests"""
        print("🚀 Starting T'aksi Comprehensive API Tests")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 80)
        
        # Core API Tests
        health_ok = self.test_health_check()
        translate_ok = self.test_translate_endpoint()
        support_ok = self.test_support_message_endpoint()
        rating_ok = self.test_rating_tags_endpoint()
        
        # Authentication Tests
        auth_ok = self.test_registration_and_auth()
        
        # Feature Tests
        sos_ok = self.test_sos_endpoints()
        admin_ok = self.test_admin_endpoints()
        ride_ok = self.test_ride_features()
        
        # Frontend Test
        frontend_ok = self.test_frontend_loading()
        
        # Print comprehensive summary
        print("\n" + "=" * 80)
        print("📊 COMPREHENSIVE TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests Run: {self.tests_run}")
        print(f"Total Tests Passed: {self.tests_passed}")
        print(f"Overall Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        print(f"\n🔍 DETAILED RESULTS:")
        print(f"🏥 Health Check: {'✅ PASS' if health_ok else '❌ FAIL'}")
        print(f"🌐 Translation API: {'✅ PASS' if translate_ok else '❌ FAIL'}")
        print(f"🤖 Support Bot API: {'✅ PASS' if support_ok else '❌ FAIL'}")
        print(f"⭐ Rating Tags API: {'✅ PASS' if rating_ok else '❌ FAIL'}")
        print(f"👤 Registration/Auth: {'✅ PASS' if auth_ok else '❌ FAIL'}")
        print(f"🚨 SOS Features: {'✅ PASS' if sos_ok else '❌ FAIL'}")
        print(f"👑 Admin Endpoints: {'✅ PASS' if admin_ok else '❌ FAIL'}")
        print(f"🚗 Ride Features: {'✅ PASS' if ride_ok else '❌ FAIL'}")
        print(f"🌐 Frontend Loading: {'✅ PASS' if frontend_ok else '❌ FAIL'}")
        
        # Determine critical issues
        critical_failures = []
        if not health_ok:
            critical_failures.append("Backend health check failed")
        if not auth_ok:
            critical_failures.append("User authentication not working")
        if not frontend_ok:
            critical_failures.append("Frontend not loading")
        
        # Overall status
        critical_tests_passed = health_ok and auth_ok and frontend_ok
        overall_success = self.tests_passed >= (self.tests_run * 0.6)  # 60% pass rate
        
        if critical_failures:
            print(f"\n🚨 CRITICAL ISSUES FOUND:")
            for failure in critical_failures:
                print(f"   ❌ {failure}")
        
        status = "✅ SYSTEM READY" if critical_tests_passed and overall_success else "⚠️  ISSUES FOUND"
        print(f"\n🎯 OVERALL STATUS: {status}")
        
        if not critical_tests_passed:
            print("❗ Critical functionality is broken - needs immediate attention")
        elif self.tests_passed < (self.tests_run * 0.8):
            print("⚠️  Some features need attention but core functionality works")
        else:
            print("✨ All major features working well!")
        
        return {
            "tests_run": self.tests_run,
            "tests_passed": self.tests_passed,
            "success_rate": self.tests_passed/self.tests_run if self.tests_run > 0 else 0,
            "critical_tests_passed": critical_tests_passed,
            "overall_success": overall_success,
            "test_results": self.test_results,
            "critical_failures": critical_failures
        }

def main():
    """Main test execution"""
    tester = TaksiAPITester()
    results = tester.run_comprehensive_tests()
    
    # Save detailed results
    with open('/app/test_reports/backend_test_results.json', 'w') as f:
        json.dump(results["test_results"], f, indent=2, default=str)
    
    # Return exit code based on success
    return 0 if results["critical_tests_passed"] and results["overall_success"] else 1

if __name__ == "__main__":
    sys.exit(main())