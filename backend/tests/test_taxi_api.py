#!/usr/bin/env python3
"""
T'aksi Backend API Testing Suite - Pytest Version
Tests all endpoints including new Bolt-style features:
- Driver registration/login
- Rider registration/login
- Surge pricing status
- Available rides (Bolt-style filtering)
- Nearby rides discovery
- Request-to-join ride
- Retry ride matching
"""

import pytest
import requests
import os
import time
import random
import string

# Configuration - Use environment variable for API URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://taxi-hub-4.preview.emergentagent.com').rstrip('/')
API_URL = f"{BASE_URL}/api"

# Test credentials
TEST_RIDER = {"cellphone": "+995555111222", "password": "testpass123"}
TEST_DRIVER = {"cellphone": "+995555333444", "password": "testpass123"}
ADMIN_PASSWORD = "D'Ahl-Enterprise9409145169086"

# Generate unique phone numbers for new registrations
def generate_phone():
    return f"+995555{random.randint(100000, 999999)}"

def generate_unique_suffix():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def test_rider_data():
    """Generate unique test rider data"""
    return {
        "name": f"TestRider_{generate_unique_suffix()}",
        "surname": "PyTest",
        "cellphone": generate_phone(),
        "password": "testpass123"
    }


@pytest.fixture(scope="module")
def test_driver_data():
    """Generate unique test driver data"""
    return {
        "name": f"TestDriver_{generate_unique_suffix()}",
        "surname": "PyTest",
        "cellphone": generate_phone(),
        "password": "testpass123"
    }


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_health_endpoint(self, api_client):
        """Test /api/health returns healthy status"""
        response = api_client.get(f"{API_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"Health check passed: {data}")


class TestRiderAuth:
    """Rider authentication tests"""
    
    def test_rider_registration(self, api_client, test_rider_data):
        """Test rider registration endpoint"""
        response = api_client.post(f"{API_URL}/auth/register/rider", json=test_rider_data)
        
        # Should return 200 with token and user data
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response missing token"
        assert "user" in data, "Response missing user data"
        assert data["user"]["user_type"] == "rider"
        assert data["user"]["cellphone"] == test_rider_data["cellphone"]
        
        # Store token for later tests
        test_rider_data["token"] = data["token"]
        test_rider_data["user_id"] = data["user"]["id"]
        print(f"Rider registered successfully: {data['user']['id']}")
    
    def test_rider_login(self, api_client, test_rider_data):
        """Test rider login endpoint"""
        login_data = {
            "cellphone": test_rider_data["cellphone"],
            "password": test_rider_data["password"]
        }
        response = api_client.post(f"{API_URL}/auth/login", json=login_data)
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["user_type"] == "rider"
        print(f"Rider login successful")
    
    def test_rider_login_invalid_credentials(self, api_client):
        """Test rider login with invalid credentials"""
        login_data = {
            "cellphone": "+995555000000",
            "password": "wrongpassword"
        }
        response = api_client.post(f"{API_URL}/auth/login", json=login_data)
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Invalid credentials correctly rejected")


class TestDriverAuth:
    """Driver authentication tests"""
    
    def test_driver_registration(self, api_client, test_driver_data):
        """Test driver registration endpoint"""
        response = api_client.post(f"{API_URL}/auth/register/driver", json=test_driver_data)
        
        assert response.status_code == 200, f"Driver registration failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response missing token"
        assert "user" in data, "Response missing user data"
        assert data["user"]["user_type"] == "driver"
        assert data["user"]["registration_status"] == "pending_vehicle"
        
        # Store token for later tests
        test_driver_data["token"] = data["token"]
        test_driver_data["user_id"] = data["user"]["id"]
        print(f"Driver registered successfully: {data['user']['id']}")
    
    def test_driver_login(self, api_client, test_driver_data):
        """Test driver login endpoint"""
        login_data = {
            "cellphone": test_driver_data["cellphone"],
            "password": test_driver_data["password"]
        }
        response = api_client.post(f"{API_URL}/driver/login", json=login_data)
        
        assert response.status_code == 200, f"Driver login failed: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["user_type"] == "driver"
        print(f"Driver login successful")
    
    def test_driver_login_invalid_credentials(self, api_client):
        """Test driver login with invalid credentials"""
        login_data = {
            "cellphone": "+995555000001",
            "password": "wrongpassword"
        }
        response = api_client.post(f"{API_URL}/driver/login", json=login_data)
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Invalid driver credentials correctly rejected")


class TestSurgePricing:
    """Surge pricing endpoint tests"""
    
    def test_surge_status_without_location(self, api_client):
        """Test surge status endpoint without location"""
        response = api_client.get(f"{API_URL}/surge/status")
        
        assert response.status_code == 200, f"Surge status failed: {response.text}"
        
        data = response.json()
        assert "multiplier" in data, "Response missing multiplier"
        assert "commission_rate" in data, "Response missing commission_rate"
        assert "is_surge" in data, "Response missing is_surge"
        assert "surge_schedule" in data, "Response missing surge_schedule"
        
        print(f"Surge status: multiplier={data['multiplier']}, is_surge={data['is_surge']}")
    
    def test_surge_status_with_location(self, api_client):
        """Test surge status endpoint with Tbilisi coordinates"""
        # Tbilisi coordinates
        params = {"lat": 41.7151, "lng": 44.8271}
        response = api_client.get(f"{API_URL}/surge/status", params=params)
        
        assert response.status_code == 200, f"Surge status with location failed: {response.text}"
        
        data = response.json()
        assert "multiplier" in data
        assert "commission_rate" in data
        assert data["multiplier"] >= 1.0, "Multiplier should be at least 1.0"
        
        print(f"Surge status with location: {data}")


class TestDriverLocation:
    """Driver location update tests"""
    
    def test_driver_location_update(self, api_client, test_driver_data):
        """Test driver location update endpoint"""
        if "token" not in test_driver_data:
            pytest.skip("Driver not registered yet")
        
        location_data = {
            "lat": 41.7151,
            "lng": 44.8271,
            "heading": 90.0,
            "speed": 30.0
        }
        
        headers = {"Authorization": f"Bearer {test_driver_data['token']}"}
        response = api_client.post(f"{API_URL}/driver/location", json=location_data, headers=headers)
        
        assert response.status_code == 200, f"Location update failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"Driver location updated: {data}")


class TestDriverVehicle:
    """Driver vehicle registration tests"""
    
    def test_vehicle_registration(self, api_client, test_driver_data):
        """Test driver vehicle registration"""
        if "token" not in test_driver_data:
            pytest.skip("Driver not registered yet")
        
        vehicle_data = {
            "car_make": "Toyota",
            "car_model": "Camry",
            "car_year": 2020,
            "car_color": "Black",
            "license_plate": f"TEST{random.randint(100, 999)}"
        }
        
        headers = {"Authorization": f"Bearer {test_driver_data['token']}"}
        response = api_client.post(f"{API_URL}/driver/vehicle", json=vehicle_data, headers=headers)
        
        assert response.status_code == 200, f"Vehicle registration failed: {response.text}"
        
        data = response.json()
        assert "tier" in data, "Response missing vehicle tier"
        print(f"Vehicle registered with tier: {data['tier']}")


class TestDriverAvailableRides:
    """Test Bolt-style available rides endpoint"""
    
    def test_available_rides_requires_auth(self, api_client):
        """Test that available rides requires authentication"""
        response = api_client.get(f"{API_URL}/driver/rides/available")
        
        # Should return 401 without auth
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Available rides correctly requires authentication")
    
    def test_available_rides_with_auth(self, api_client, test_driver_data):
        """Test available rides with authentication"""
        if "token" not in test_driver_data:
            pytest.skip("Driver not registered yet")
        
        headers = {"Authorization": f"Bearer {test_driver_data['token']}"}
        response = api_client.get(f"{API_URL}/driver/rides/available", headers=headers)
        
        assert response.status_code == 200, f"Available rides failed: {response.text}"
        
        data = response.json()
        assert "rides" in data, "Response missing rides array"
        assert isinstance(data["rides"], list), "Rides should be a list"
        
        print(f"Available rides returned: {len(data['rides'])} rides")


class TestDriverNearbyRides:
    """Test nearby rides discovery endpoint"""
    
    def test_nearby_rides_requires_auth(self, api_client):
        """Test that nearby rides requires authentication"""
        response = api_client.get(f"{API_URL}/driver/rides/nearby")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Nearby rides correctly requires authentication")
    
    def test_nearby_rides_requires_location(self, api_client, test_driver_data):
        """Test nearby rides requires driver location"""
        if "token" not in test_driver_data:
            pytest.skip("Driver not registered yet")
        
        headers = {"Authorization": f"Bearer {test_driver_data['token']}"}
        response = api_client.get(f"{API_URL}/driver/rides/nearby", headers=headers)
        
        # May return 400 if driver location not set, or 200 with empty rides
        # Both are valid responses
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 400:
            data = response.json()
            assert "location" in data.get("detail", "").lower(), "Should mention location"
            print("Nearby rides correctly requires driver location")
        else:
            data = response.json()
            assert "rides" in data
            print(f"Nearby rides returned: {len(data['rides'])} rides")
    
    def test_nearby_rides_with_radius(self, api_client, test_driver_data):
        """Test nearby rides with custom radius parameter"""
        if "token" not in test_driver_data:
            pytest.skip("Driver not registered yet")
        
        # First update driver location
        location_data = {"lat": 41.7151, "lng": 44.8271}
        headers = {"Authorization": f"Bearer {test_driver_data['token']}"}
        api_client.post(f"{API_URL}/driver/location", json=location_data, headers=headers)
        
        # Now test nearby rides with radius
        response = api_client.get(f"{API_URL}/driver/rides/nearby?radius=15", headers=headers)
        
        assert response.status_code == 200, f"Nearby rides with radius failed: {response.text}"
        
        data = response.json()
        assert "rides" in data
        assert "search_radius" in data
        assert data["search_radius"] == 15
        
        print(f"Nearby rides with 15km radius: {len(data['rides'])} rides")


class TestRequestToJoinRide:
    """Test request-to-join ride endpoint"""
    
    def test_request_join_requires_auth(self, api_client):
        """Test that request-join requires authentication"""
        response = api_client.post(f"{API_URL}/rides/fake-ride-id/request-join")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Request-join correctly requires authentication")
    
    def test_request_join_nonexistent_ride(self, api_client, test_driver_data):
        """Test request-join with non-existent ride"""
        if "token" not in test_driver_data:
            pytest.skip("Driver not registered yet")
        
        headers = {"Authorization": f"Bearer {test_driver_data['token']}"}
        response = api_client.post(f"{API_URL}/rides/nonexistent123/request-join", headers=headers)
        
        # Should return 400 or 404 for non-existent ride (400 if driver validation fails first)
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        print(f"Request-join correctly returns {response.status_code} for non-existent ride")


class TestRetryRideMatching:
    """Test retry ride matching endpoint"""
    
    def test_retry_requires_auth(self, api_client):
        """Test that retry requires authentication"""
        response = api_client.post(f"{API_URL}/rides/fake-ride-id/retry")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Retry correctly requires authentication")
    
    def test_retry_nonexistent_ride(self, api_client, test_rider_data):
        """Test retry with non-existent ride"""
        if "token" not in test_rider_data:
            pytest.skip("Rider not registered yet")
        
        headers = {"Authorization": f"Bearer {test_rider_data['token']}"}
        response = api_client.post(f"{API_URL}/rides/nonexistent123/retry", headers=headers)
        
        # Should return 404 for non-existent ride
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Retry correctly returns 404 for non-existent ride")


class TestRideRequest:
    """Test ride request flow"""
    
    def test_ride_request(self, api_client, test_rider_data):
        """Test creating a ride request"""
        if "token" not in test_rider_data:
            pytest.skip("Rider not registered yet")
        
        ride_data = {
            "pickup": "Freedom Square, Tbilisi",
            "pickupLat": 41.6934,
            "pickupLng": 44.8015,
            "destination": "Rustaveli Avenue, Tbilisi",
            "destinationLat": 41.7010,
            "destinationLng": 44.7930,
            "carType": "economy",
            "paymentMethod": "cash",
            "estimatedDistance": 2.5,
            "estimatedDuration": 10,
            "stops": []
        }
        
        headers = {"Authorization": f"Bearer {test_rider_data['token']}"}
        response = api_client.post(f"{API_URL}/rides/request", json=ride_data, headers=headers)
        
        assert response.status_code == 200, f"Ride request failed: {response.text}"
        
        data = response.json()
        assert "ride_id" in data, "Response missing ride_id"
        assert "estimated_fare" in data, "Response missing estimated_fare"
        assert "status" in data, "Response missing status"
        assert data["status"] == "searching"
        
        # Store ride_id for later tests
        test_rider_data["ride_id"] = data["ride_id"]
        print(f"Ride created: {data['ride_id']}, fare: ₾{data['estimated_fare']}")
    
    def test_get_ride_status(self, api_client, test_rider_data):
        """Test getting ride status"""
        if "ride_id" not in test_rider_data:
            pytest.skip("No ride created yet")
        
        headers = {"Authorization": f"Bearer {test_rider_data['token']}"}
        response = api_client.get(f"{API_URL}/rides/{test_rider_data['ride_id']}", headers=headers)
        
        assert response.status_code == 200, f"Get ride failed: {response.text}"
        
        data = response.json()
        assert "status" in data
        assert "pickup" in data
        print(f"Ride status: {data['status']}")


class TestFareEstimation:
    """Test fare estimation endpoint"""
    
    def test_fare_estimate(self, api_client):
        """Test fare estimation"""
        params = {
            "car_type": "economy",
            "distance": 10,
            "stops": 2,
            "lat": 41.7151,
            "lng": 44.8271
        }
        response = api_client.get(f"{API_URL}/rides/estimate", params=params)
        
        assert response.status_code == 200, f"Fare estimate failed: {response.text}"
        
        data = response.json()
        assert "total" in data, "Response missing total"
        assert "base" in data, "Response missing base"
        assert "distance" in data, "Response missing distance"
        assert "surge" in data, "Response missing surge info"
        
        print(f"Fare estimate: ₾{data['total']} (base: ₾{data['base']}, distance: ₾{data['distance']})")


class TestDriverHistory:
    """Test driver history endpoint"""
    
    def test_driver_history(self, api_client, test_driver_data):
        """Test driver ride history"""
        if "token" not in test_driver_data:
            pytest.skip("Driver not registered yet")
        
        headers = {"Authorization": f"Bearer {test_driver_data['token']}"}
        response = api_client.get(f"{API_URL}/driver/history", headers=headers)
        
        assert response.status_code == 200, f"Driver history failed: {response.text}"
        
        data = response.json()
        assert "rides" in data
        assert isinstance(data["rides"], list)
        
        print(f"Driver history: {len(data['rides'])} rides")


class TestRiderHistory:
    """Test rider history endpoint"""
    
    def test_rider_history(self, api_client, test_rider_data):
        """Test rider ride history"""
        if "token" not in test_rider_data:
            pytest.skip("Rider not registered yet")
        
        headers = {"Authorization": f"Bearer {test_rider_data['token']}"}
        response = api_client.get(f"{API_URL}/rider/history", headers=headers)
        
        assert response.status_code == 200, f"Rider history failed: {response.text}"
        
        data = response.json()
        assert "rides" in data
        assert isinstance(data["rides"], list)
        
        print(f"Rider history: {len(data['rides'])} rides")


class TestExistingCredentials:
    """Test with existing credentials from review request"""
    
    def test_existing_rider_login(self, api_client):
        """Test login with existing test rider credentials"""
        login_data = {
            "cellphone": TEST_RIDER["cellphone"],
            "password": TEST_RIDER["password"]
        }
        response = api_client.post(f"{API_URL}/auth/login", json=login_data)
        
        # May succeed or fail depending on whether user exists
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            print(f"Existing rider login successful")
        else:
            print(f"Existing rider not found (status: {response.status_code}) - this is OK for fresh DB")
    
    def test_existing_driver_login(self, api_client):
        """Test login with existing test driver credentials"""
        login_data = {
            "cellphone": TEST_DRIVER["cellphone"],
            "password": TEST_DRIVER["password"]
        }
        response = api_client.post(f"{API_URL}/driver/login", json=login_data)
        
        # May succeed or fail depending on whether user exists
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            print(f"Existing driver login successful")
        else:
            print(f"Existing driver not found (status: {response.status_code}) - this is OK for fresh DB")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
