"""
اختبارات وحدة المصادقة ونظام المشرف وإحصائيات الزيارات
منصة استمارة تقييم أداء الهيئة التدريسية (استمارة 21)
"""
import unittest
from core.auth_db import (
    register_user, authenticate_user, get_user_by_session, delete_session,
    log_visit, get_admin_analytics, is_admin_account, verify_password, hash_password
)


class TestAuthenticationAndAdmin(unittest.TestCase):

    def test_password_hashing_and_verification(self):
        pwd = "SecurePassword@2026"
        hashed = hash_password(pwd)
        self.assertTrue(hashed.startswith("pbkdf2_sha256$"))
        self.assertTrue(verify_password(pwd, hashed))
        self.assertFalse(verify_password("WrongPassword", hashed))

    def test_admin_recognition(self):
        self.assertTrue(is_admin_account("drahmedlouay", "user@test.com"))
        self.assertTrue(is_admin_account("drAhmedLouay", "user@test.com"))
        self.assertTrue(is_admin_account("any_user", "drahmedlouay@uotechnology.edu.iq"))
        self.assertTrue(is_admin_account("any_user", "drahmedlouay@gmail.com"))
        self.assertFalse(is_admin_account("faculty1", "faculty1@test.com"))

    def test_user_registration_and_authentication(self):
        import uuid
        uid = uuid.uuid4().hex[:6]
        username = f"user_{uid}"
        email = f"user_{uid}@uotechnology.edu.iq"
        pwd = "Password@123"

        reg_res = register_user(username, email, pwd, "د. محمد علي")
        self.assertTrue(reg_res["success"])
        self.assertEqual(reg_res["user"]["role"], "faculty")
        self.assertFalse(reg_res["user"]["is_admin"])

        # تسجيل الدخول بالبريد
        auth_email = authenticate_user(email, pwd)
        self.assertTrue(auth_email["success"])
        self.assertEqual(auth_email["user"]["username"], username)

        # تسجيل الدخول باسم المستخدم
        auth_user = authenticate_user(username, pwd)
        self.assertTrue(auth_user["success"])

        # فحص كلمة المرور الخاطئة
        auth_wrong = authenticate_user(username, "wrong_pwd")
        self.assertFalse(auth_wrong["success"])

    def test_drahmedlouay_is_always_admin(self):
        # فحص حساب drahmedlouay الافتراضي أو عند تسجيله
        auth_res = authenticate_user("drahmedlouay", "drahmedlouay2026")
        self.assertTrue(auth_res["success"])
        self.assertTrue(auth_res["user"]["is_admin"])
        self.assertEqual(auth_res["user"]["role"], "admin")

    def test_session_management(self):
        auth_res = authenticate_user("drahmedlouay", "drahmedlouay2026")
        token = auth_res["token"]
        self.assertIsNotNone(token)

        user_info = get_user_by_session(token)
        self.assertIsNotNone(user_info)
        self.assertEqual(user_info["username"], "drahmedlouay")

        # حذف الجلسة
        self.assertTrue(delete_session(token))
        self.assertIsNone(get_user_by_session(token))

    def test_visit_logging_and_admin_stats(self):
        log_visit("10.0.0.1", "TestBot/1.0", "/api/test", None)
        stats = get_admin_analytics()
        self.assertIn("total_users", stats)
        self.assertIn("total_visits", stats)
        self.assertIn("unique_visitors", stats)
        self.assertIn("users", stats)
        self.assertGreaterEqual(stats["total_users"], 1)
        self.assertGreaterEqual(stats["total_visits"], 1)


class TestAuthAPIEndpoints(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app import app
        cls.client = TestClient(app)

    def test_api_admin_flow(self):
        # تسجيل دخول المشرف
        res = self.client.post("/api/auth/login", json={
            "identifier": "drahmedlouay",
            "password": "drahmedlouay2026"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["user"]["role"], "admin")
        self.assertTrue(data["user"]["is_admin"])
        admin_token = data["token"]

        # فحص /api/auth/me
        me_res = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(me_res.status_code, 200)
        self.assertTrue(me_res.json()["authenticated"])
        self.assertEqual(me_res.json()["user"]["username"], "drahmedlouay")

        # فحص إحصائيات المشرف
        stats_res = self.client.get("/api/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(stats_res.status_code, 200)
        s_data = stats_res.json()
        self.assertTrue(s_data["success"])
        self.assertGreaterEqual(s_data["total_users"], 1)
        self.assertGreaterEqual(s_data["total_visits"], 1)

    def test_api_regular_user_forbidden_from_admin_stats(self):
        import uuid
        uid = uuid.uuid4().hex[:6]
        # تسجيل تدريسي عادي
        res = self.client.post("/api/auth/register", json={
            "username": f"prof_{uid}",
            "email": f"prof_{uid}@uotechnology.edu.iq",
            "password": "TestPassword123",
            "full_name": "أستاذ باحث"
        })
        self.assertEqual(res.status_code, 200)
        user_token = res.json()["token"]
        self.assertEqual(res.json()["user"]["role"], "faculty")

        # محاولة الوصول إلى لوحة المشرف -> يجب أن ترفض بـ 403
        stats_res = self.client.get("/api/admin/stats", headers={"Authorization": f"Bearer {user_token}"})
        self.assertEqual(stats_res.status_code, 403)


if __name__ == "__main__":
    unittest.main()
