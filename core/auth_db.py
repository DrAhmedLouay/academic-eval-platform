"""
نظام إدارة المستخدمين والمصادقة والتحليلات لمنصة استمارة 21
وزارة التعليم العالي والبحث العلمي - جمهورية العراق
يدعم التسجيل بالبريد الإلكتروني ورمز المرور مع حماية PBKDF2-HMAC-SHA256
وصلاحيات المشرف (Admin) لـ drahmedlouay وتتبع الزيارات والمستخدمين
"""
import os
import sqlite3
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "academic_platform.db")

os.makedirs(DATA_DIR, exist_ok=True)


def get_db_connection() -> sqlite3.Connection:
    """الحصول على اتصال بقاعدة بيانات SQLite مع دعم القواميس"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str) -> str:
    """تشفير كلمة المرور باستخدام PBKDF2-HMAC-SHA256 مع ملح عشوائي 16 بايت"""
    salt = secrets.token_hex(16)
    iterations = 100000
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations
    )
    return f"pbkdf2_sha256${iterations}${salt}${key.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """التحقق من كلمة المرور بصورة آمنة مع حماية من توقيت الهجمات"""
    if not hashed or not password:
        return False
    try:
        parts = hashed.split('$')
        if len(parts) != 4 or parts[0] != 'pbkdf2_sha256':
            return False
        iterations = int(parts[1])
        salt = parts[2]
        expected_key = parts[3]
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            iterations
        )
        return hmac.compare_digest(key.hex(), expected_key)
    except Exception:
        return False


def is_admin_account(username: str, email: str) -> bool:
    """فحص ما إذا كان الحساب ينتمي للمشرف drahmedlouay"""
    u = (username or "").strip().lower()
    e = (email or "").strip().lower()
    if u == "drahmedlouay" or "drahmedlouay" in u:
        return True
    if e.startswith("drahmedlouay") or "drahmedlouay" in e:
        return True
    return False


def init_database():
    """تهيئة جداول قاعدة البيانات وإنشاء الحساب الافتراضي للمشرف إن لم يوجد"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # جدول المستخدمين
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        college TEXT DEFAULT '',
        department TEXT DEFAULT '',
        academic_rank TEXT DEFAULT 'تدريسي',
        role TEXT NOT NULL DEFAULT 'faculty',
        created_at TEXT NOT NULL,
        last_login TEXT
    )
    """)

    # جدول جلسات تسجيل الدخول
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # جدول سجل الزيارات والتصفح
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT,
        user_agent TEXT,
        path TEXT,
        user_id INTEGER,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
    """)

    # إنشاء الفهارس للسرعة
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_visits_timestamp ON visits(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits(ip_address)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)")

    conn.commit()

    # التحقق من وجود حساب المشرف drahmedlouay
    cursor.execute("SELECT id FROM users WHERE username = 'drahmedlouay' OR email = 'drahmedlouay@uotechnology.edu.iq'")
    admin_row = cursor.fetchone()
    if not admin_row:
        now_iso = datetime.now().isoformat()
        admin_pwd_hash = hash_password("drahmedlouay2026")
        cursor.execute("""
        INSERT INTO users (username, email, password_hash, full_name, college, department, academic_rank, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "drahmedlouay",
            "drahmedlouay@uotechnology.edu.iq",
            admin_pwd_hash,
            "أ.م.د. أحمد لؤي أحمد",
            "الجامعة التكنولوجية",
            "قسم هندسة العمارة",
            "أستاذ مساعد",
            "admin",
            now_iso
        ))
        conn.commit()

    conn.close()


def register_user(
    username: str,
    email: str,
    password: str,
    full_name: str,
    college: str = "الجامعة التكنولوجية",
    department: str = "قسم هندسة العمارة",
    academic_rank: str = "تدريسي"
) -> Dict[str, Any]:
    """
    تسجيل مستخدم جديد في المنصة
    مع منح رتبة المشرف admin تلقائياً لـ drahmedlouay
    """
    username = (username or "").strip().lower()
    email = (email or "").strip().lower()
    full_name = (full_name or "").strip()

    if not email or "@" not in email:
        return {"success": False, "error": "يرجى إدخال بريد إلكتروني صحيح"}
    if not username:
        username = email.split("@")[0]
    if len(username) < 3:
        return {"success": False, "error": "اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل"}
    if not password or len(password) < 6:
        return {"success": False, "error": "رمز المرور يجب أن يتكون من 6 خانات على الأقل"}
    if not full_name:
        full_name = "التدريسي " + username

    role = "admin" if is_admin_account(username, email) else "faculty"
    pwd_hash = hash_password(password)
    now_iso = datetime.now().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # إذا كان الحساب هو drahmedlouay وموجوداً مسبقاً، نحدث كلمة المرور والبيانات
        if is_admin_account(username, email):
            cursor.execute("SELECT id FROM users WHERE username = ? OR email = ?", (username, email))
            existing_admin = cursor.fetchone()
            if existing_admin:
                user_id = existing_admin["id"]
                cursor.execute("""
                UPDATE users
                SET password_hash = ?, full_name = ?, role = 'admin', college = ?, department = ?, academic_rank = ?
                WHERE id = ?
                """, (pwd_hash, full_name, college, department, academic_rank, user_id))
                conn.commit()
                token = create_session(user_id)
                user_info = get_user_by_id(user_id)
                conn.close()
                return {"success": True, "token": token, "user": user_info, "message": "تم تحديث وتفعيل حساب المشرف بنجاح"}

        # فحص وجود البريد أو اسم المستخدم
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        if cursor.fetchone():
            conn.close()
            return {"success": False, "error": "البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول"}

        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            conn.close()
            return {"success": False, "error": "اسم المستخدم مستخدم مسبقاً، يرجى اختيار اسم مستخدم آخر"}

        cursor.execute("""
        INSERT INTO users (username, email, password_hash, full_name, college, department, academic_rank, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (username, email, pwd_hash, full_name, college, department, academic_rank, role, now_iso))
        user_id = cursor.lastrowid
        conn.commit()

        token = create_session(user_id)
        user_info = get_user_by_id(user_id)
        conn.close()
        return {"success": True, "token": token, "user": user_info, "message": "تم إنشاء الحساب وتسجيل الدخول بنجاح"}

    except sqlite3.IntegrityError as e:
        conn.close()
        return {"success": False, "error": "البريد أو اسم المستخدم مسجل بالفعل"}
    except Exception as e:
        conn.close()
        return {"success": False, "error": f"حدث خطأ أثناء التسجيل: {str(e)}"}


def authenticate_user(identifier: str, password: str) -> Dict[str, Any]:
    """
    تسجيل الدخول باستخدام البريد الإلكتروني أو اسم المستخدم مع رمز المرور
    """
    ident = (identifier or "").strip().lower()
    if not ident or not password:
        return {"success": False, "error": "يرجى إدخال البريد الإلكتروني أو اسم المستخدم ورمز المرور"}

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT id, username, email, password_hash, full_name, college, department, academic_rank, role
    FROM users
    WHERE lower(email) = ? OR lower(username) = ?
    """, (ident, ident))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return {"success": False, "error": "بيانات الدخول غير صحيحة. الحساب غير موجود"}

    user_id = row["id"]
    hashed_pwd = row["password_hash"]

    if not verify_password(password, hashed_pwd):
        conn.close()
        return {"success": False, "error": "رمز المرور غير صحيح. يرجى المحاولة مجدداً"}

    # تحديث وقت آخر تسجيل دخول
    now_iso = datetime.now().isoformat()
    cursor.execute("UPDATE users SET last_login = ? WHERE id = ?", (now_iso, user_id))
    conn.commit()

    token = create_session(user_id)
    user_info = {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "full_name": row["full_name"],
        "college": row["college"],
        "department": row["department"],
        "academic_rank": row["academic_rank"],
        "role": row["role"],
        "is_admin": (row["role"] == "admin" or is_admin_account(row["username"], row["email"]))
    }
    conn.close()

    return {"success": True, "token": token, "user": user_info, "message": "تم تسجيل الدخول بنجاح"}


def create_session(user_id: int) -> str:
    """إنشاء رمز جلسة فريد للمستخدم صالح لمدة 30 يوماً"""
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    expires_at = (now + timedelta(days=30)).isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
    """, (token, user_id, now.isoformat(), expires_at))
    conn.commit()
    conn.close()
    return token


def get_user_by_session(token: str) -> Optional[Dict[str, Any]]:
    """الحصول على بيانات المستخدم من خلال رمز الجلسة"""
    if not token:
        return None

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT u.id, u.username, u.email, u.full_name, u.college, u.department, u.academic_rank, u.role, u.created_at, u.last_login, s.expires_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
    """, (token,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    # فحص انتهاء الجلسة
    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.now() > expires_at:
        delete_session(token)
        return None

    is_admin = (row["role"] == "admin" or is_admin_account(row["username"], row["email"]))
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "full_name": row["full_name"],
        "college": row["college"],
        "department": row["department"],
        "academic_rank": row["academic_rank"],
        "role": "admin" if is_admin else row["role"],
        "is_admin": is_admin,
        "created_at": row["created_at"],
        "last_login": row["last_login"]
    }


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """الحصول على بيانات المستخدم عبر المعرف الرقمي"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, username, email, full_name, college, department, academic_rank, role, created_at, last_login
    FROM users WHERE id = ?
    """, (user_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    is_admin = (row["role"] == "admin" or is_admin_account(row["username"], row["email"]))
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "full_name": row["full_name"],
        "college": row["college"],
        "department": row["department"],
        "academic_rank": row["academic_rank"],
        "role": "admin" if is_admin else row["role"],
        "is_admin": is_admin,
        "created_at": row["created_at"],
        "last_login": row["last_login"]
    }


def delete_session(token: str) -> bool:
    """حذف الجلسة عند تسجيل الخروج"""
    if not token:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    return True


def log_visit(ip_address: str, user_agent: str = "", path: str = "/", user_id: Optional[int] = None) -> int:
    """تسجيل زيارة جديدة في قاعدة البيانات"""
    now_iso = datetime.now().isoformat()
    # تنظيف IP المحلي أو وراء الوكيل العكسي
    ip = (ip_address or "127.0.0.1").split(",")[0].strip()
    ua = (user_agent or "")[:250]
    p = (path or "/")[:150]

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO visits (ip_address, user_agent, path, user_id, timestamp)
    VALUES (?, ?, ?, ?, ?)
    """, (ip, ua, p, user_id, now_iso))
    conn.commit()
    visit_id = cursor.lastrowid
    conn.close()
    return visit_id


def clear_all_visits() -> bool:
    """تصفير وإعادة تعيين سجلات وإحصائيات الزيارات بالكامل للمنصة"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM visits")
    conn.commit()
    conn.close()
    return True


def get_admin_analytics() -> Dict[str, Any]:
    """
    استخراج تحليلات وإحصائيات شاملة للمشرف العام:
    - إجمالي عدد المستخدمين المسجلين
    - إجمالي عدد الزيارات
    - عدد الزوار الفريدين
    - قائمة تفصيلية بجميع المسجلين
    - جدول الزيارات اليومية للأسبوعين الأخيرين
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. إجمالي عدد المستخدمين
    cursor.execute("SELECT COUNT(*) AS total FROM users")
    total_users = cursor.fetchone()["total"]

    # 2. إجمالي عدد الزيارات
    cursor.execute("SELECT COUNT(*) AS total FROM visits")
    total_visits = cursor.fetchone()["total"]

    # 3. عدد الزوار الفريدين (Unique IP Addresses)
    cursor.execute("SELECT COUNT(DISTINCT ip_address) AS unique_count FROM visits")
    unique_visitors = cursor.fetchone()["unique_count"]

    # 4. قائمة المستخدمين المسجلين
    cursor.execute("""
    SELECT id, username, email, full_name, college, department, academic_rank, role, created_at, last_login
    FROM users
    ORDER BY id DESC
    """)
    users_rows = cursor.fetchall()
    users_list = []
    for u in users_rows:
        is_adm = (u["role"] == "admin" or is_admin_account(u["username"], u["email"]))
        users_list.append({
            "id": u["id"],
            "username": u["username"],
            "email": u["email"],
            "full_name": u["full_name"],
            "college": u["college"],
            "department": u["department"],
            "academic_rank": u["academic_rank"],
            "role": "admin" if is_adm else u["role"],
            "is_admin": is_adm,
            "created_at": u["created_at"],
            "last_login": u["last_login"] or "لم يسجل بعد"
        })

    # 5. الزيارات اليومية لآخر 14 يوماً
    cursor.execute("""
    SELECT substr(timestamp, 1, 10) AS day, COUNT(*) AS count, COUNT(DISTINCT ip_address) AS unique_ips
    FROM visits
    GROUP BY day
    ORDER BY day DESC
    LIMIT 14
    """)
    daily_rows = cursor.fetchall()
    daily_visits = [
        {"day": r["day"], "count": r["count"], "unique_ips": r["unique_ips"]}
        for r in daily_rows
    ]

    # 6. آخر 30 زيارة مسجلة
    cursor.execute("""
    SELECT v.id, v.ip_address, v.path, v.timestamp, u.username, u.full_name
    FROM visits v
    LEFT JOIN users u ON v.user_id = u.id
    ORDER BY v.id DESC
    LIMIT 30
    """)
    recent_visit_rows = cursor.fetchall()
    recent_visits = [
        {
            "id": r["id"],
            "ip": r["ip_address"],
            "path": r["path"],
            "timestamp": r["timestamp"],
            "user": r["full_name"] or r["username"] or "زائر غير مسجل"
        }
        for r in recent_visit_rows
    ]

    # 7. عدد زيارات اليوم (visits_today)
    today_str = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("SELECT COUNT(*) AS today_count FROM visits WHERE substr(timestamp, 1, 10) = ?", (today_str,))
    visits_today = cursor.fetchone()["today_count"]

    conn.close()

    return {
        "success": True,
        "total_users": total_users,
        "total_visits": total_visits,
        "unique_visitors": unique_visitors,
        "visits_today": visits_today,
        "users": users_list,
        "daily_visits": daily_visits,
        "recent_visits": recent_visits,
        "generated_at": datetime.now().isoformat()
    }


# تهيئة الجداول فور استدعاء الملف
init_database()
