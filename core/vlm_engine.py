"""
محرك الرؤية متعدد الوسائط والذكاء الاصطناعي البصري (Multimodal VLM Engine)
يدعم التكامل مع Google Gemini 1.5 Flash VLM مع محرك الرؤية المحلي المدمج،
واستخراج الحقول بصيغة JSON الهيكلية مع صناديق التظليل البصري (Bounding Boxes)
والمطابقة السياقية لاسم التدريسي في الأوامر الإدارية الجماعية.
"""
import os
import re
import json
import base64
import urllib.request
from typing import Dict, Any, Optional, List, Tuple
from PIL import Image

from core.ocr_engine import process_document, normalize_arabic_text
from core.scopus_crossref import extract_doi, match_offline_journal, calculate_paper_score_and_role

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vlm_config.json")


def load_vlm_config() -> Dict[str, Any]:
    """تحميل إعدادات محرك VLM ومفتاح API"""
    config = {
        "engine": "hybrid",  # "hybrid", "gemini", "local"
        "gemini_api_key": os.environ.get("GEMINI_API_KEY", ""),
        "model": "gemini-2.0-flash",
        "faculty_default_name": "أحمد لؤي أحمد"
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
                config.update(saved)
        except Exception:
            pass
    return config


def save_vlm_config(config: Dict[str, Any]) -> bool:
    """حفظ إعدادات VLM ومفتاح API"""
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def normalize_arabic_name(name: str) -> str:
    """
    تسوية وتوحيد الأسماء العربية للبحث المرن متجاوزاً اختلافات الهمزات،
    الألقاب العلمية، والألف المقصورة والتنوين والتطويل.
    """
    if not name:
        return ""
    text = name.strip()
    # تجريد التشكيل والتطويل
    text = re.sub(r'[\u064B-\u065F\u0640]', '', text)
    # إزالة الألقاب العلمية والرتب الشائعة
    text = re.sub(r'(?:أ\.د\.|أ\.م\.د\.|م\.د\.|م\.م\.|د\.|\bدكتور|\bأستاذ|\bمدرس|\bمساعد|\bالمهندس|\bالمعماري|\bالسيد|\bالسيدة)\b', ' ', text)
    # توحيد الهمزات
    text = re.sub(r'[أإآٱ]', 'ا', text)
    # توحيد الياء والهمزة على نبرة
    text = re.sub(r'[ىئ]', 'ي', text)
    # توحيد الواو والهمزة على واو
    text = re.sub(r'ؤ', 'و', text)
    # توحيد التاء المربوطة
    text = re.sub(r'ة', 'ه', text)
    # تنظيف الفواصل والرموز
    text = re.sub(r'[.,\/#!$%\^&\*;:{}=\-_`~()\[\]|]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def extract_faculty_role_in_order(text: str, faculty_name: str) -> Optional[Dict[str, Any]]:
    """
    البحث الذكي المتقدم عن اسم التدريسي في الأوامر الإدارية والجداول وقوائم اللجان
    وتحديد دوره وصفته (رئيس لجنة، عضو ومقرر، عضو لجنة، مشرف، محاضر، مشارك، مكرم).
    """
    if not text or not faculty_name:
        return None
    
    norm_target = normalize_arabic_name(faculty_name)
    target_tokens = [p for p in norm_target.split() if len(p) >= 2]
    if not target_tokens:
        return None
    
    min_matches = min(len(target_tokens), 2) if len(target_tokens) >= 2 else 1
    
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    total_lines = len(lines)
    
    for idx, line in enumerate(lines):
        norm_line = normalize_arabic_name(line)
        matches = sum(1 for tok in target_tokens if tok in norm_line)
        
        if matches >= min_matches:
            # استخراج رقم التسلسل إن وجد في بداية السطر أو الجدول
            order_index = None
            seq_match = re.search(r'^(?:\|\s*)?(\d+)[\.\-\)\s\|]', line) or re.search(r'ت\s*[:\.]?\s*(\d+)', line)
            if seq_match:
                order_index = seq_match.group(1)
                
            # استخراج اللقب العلمي
            academic_rank = "تدريسي"
            if re.search(r'أ\.د\.|أستاذ دكتور|\bأستاذ\b', line):
                academic_rank = "أستاذ"
            elif re.search(r'أ\.م\.د\.|أستاذ مساعد', line):
                academic_rank = "أستاذ مساعد"
            elif re.search(r'م\.د\.|مدرس دكتور|\bمدرس\b', line):
                academic_rank = "مدرس"
            elif re.search(r'م\.م\.|مدرس مساعد', line):
                academic_rank = "مدرس مساعد"
            elif re.search(r'\bدكتور\b|د\.', line):
                academic_rank = "دكتور"
            
            # فحص السطر المباشر أولاً ثم السطور المجاورة لمعرفة الدور
            context_window = " ".join(lines[max(0, idx - 1): min(total_lines, idx + 2)])
            target_str = line if any(k in line for k in ["رئيساً", "رئيسا", "عضواً", "عضو", "مقرراً", "مقرر", "مشرفاً", "مشرف", "محاضراً", "شكر", "مشارك"]) else context_window
            
            role = "عضو لجنة"
            score = 20.0
            p_target = "1"
            
            if any(k in target_str for k in ["رئيساً", "رئيس اللجنة", "رئيس لجنة", "رئيسا", "رئيس الفريق"]):
                role = "رئيس لجنة"
                score = 30.0
                p_target = "1"
            elif any(k in target_str for k in ["عضو ومقرر", "عضواً ومقرراً", "عضوا ومقررا", "مقرر اللجنة", "مقرراً", "مقررا"]):
                role = "عضو ومقرر"
                score = 25.0
                p_target = "1"
            elif any(k in target_str for k in ["لجنة امتحانية", "امتحانية", "الامتحانية"]):
                role = "عضو لجنة امتحانية"
                score = 30.0
                p_target = "1"
            elif any(k in target_str for k in ["مشاريع تخرج", "مشروع تخرج", "مناقشة مشاريع"]):
                role = "عضو لجنة مناقشة مشاريع التخرج"
                score = 30.0
                p_target = "1"
            elif any(k in target_str for k in ["مشرفاً", "مشرف", "إشراف", "اشراف", "أطروحة", "رسالة"]):
                role = "مشرف على دراسات عليا"
                score = 15.0
                p_target = "3"
            elif any(k in target_str for k in ["محاضراً", "محاضر", "إلقاء محاضرة", "القاء محاضرة", "مدرب"]):
                role = "محاضر في دورة تعليم مستمر"
                score = 10.0
                p_target = "2"
            elif any(k in target_str for k in ["شكر وتقدير", "شكرنا وتقديرنا", "توجيه الشكر", "نوجه شكرنا"]):
                role = "مكرم بكتاب شكر وتقدير"
                score = 15.0
                p_target = "3"
            elif any(k in target_str for k in ["شهادة مشاركة", "حضور", "مشارك", "مشاركة"]):
                role = "مشارك في مؤتمر أو ورشة"
                score = 5.0
                p_target = "2"
            elif any(k in target_str for k in ["عضواً", "عضو", "أعضاء", "عضوية"]):
                role = "عضو لجنة"
                score = 20.0
                p_target = "1"
            
            # توليد سطر مُميَّز بصيغة HTML للعرض البصري
            highlighted_line = line
            # محاولة إحاطة اسم التدريسي بـ mark
            for tok in faculty_name.split():
                if len(tok) >= 3 and tok in highlighted_line:
                    highlighted_line = highlighted_line.replace(tok, f'<mark class="faculty-name-highlight">{tok}</mark>')
                    break
            if '<mark' not in highlighted_line:
                highlighted_line = f'<mark class="faculty-name-highlight">{line}</mark>'
                
            approx_top = min(85.0, max(25.0, 30.0 + (float(idx) / max(total_lines, 1)) * 50.0))
            
            return {
                "matched_name": faculty_name,
                "detected_line": line,
                "highlighted_line": highlighted_line,
                "role": role,
                "academic_rank": academic_rank,
                "order_index": order_index,
                "suggested_score": score,
                "suggested_paragraph": p_target,
                "approx_top_pct": approx_top
            }
            
    return None


def calculate_local_bounding_boxes(
    text: str,
    doc_number: str,
    date: str,
    subject: str,
    matched_faculty_info: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    توليد صناديق تظليل بصرية تقريبية (Bounding Boxes) للحقول الأساسية
    بالنسب المئوية (0% - 100%) لتمكين العرض التفاعلي فوق صورة الوثيقة
    مع إدراج صندوق اسم التدريسي في حال تمييزه.
    """
    bboxes: Dict[str, Any] = {}
    
    # ترويسة الكتب الإدارية العراقية تقع دائماً في الثلث العلوي (Top: 5% - 25%)
    # والعدد والتاريخ في الجانب الأيمن أو الأيسر
    if doc_number and doc_number != "غير محدد":
        bboxes["doc_number"] = {
            "top": 14.5,
            "left": 18.0,
            "width": 24.0,
            "height": 4.5,
            "label": f"العدد: {doc_number}",
            "color": "#16a34a"  # أخضر
        }
        
    if date and date != "غير محدد":
        bboxes["date"] = {
            "top": 19.5,
            "left": 18.0,
            "width": 22.0,
            "height": 4.0,
            "label": f"التاريخ: {date}",
            "color": "#2563eb"  # أزرق
        }
        
    if subject and subject != "غير محدد":
        bboxes["subject"] = {
            "top": 31.0,
            "left": 25.0,
            "width": 55.0,
            "height": 6.0,
            "label": f"الموضوع: {subject[:40]}...",
            "color": "#d97706"  # برتقالي
        }
        
    if matched_faculty_info:
        top_pos = matched_faculty_info.get("approx_top_pct", 55.0)
        m_name = matched_faculty_info.get("matched_name", "التدريسي")
        m_role = matched_faculty_info.get("role", "عضو")
        bboxes["faculty"] = {
            "top": top_pos,
            "left": 15.0,
            "width": 70.0,
            "height": 5.5,
            "label": f"التدريسي: {m_name} ({m_role})",
            "color": "#059669"  # أخضر زمردي مميز
        }
        
    return bboxes


def call_gemini_vlm_api(
    image_path: str,
    api_key: str,
    faculty_name: str = "أحمد لؤي أحمد",
    model: str = "gemini-2.0-flash",
    timeout_sec: int = 20
) -> Optional[Dict[str, Any]]:
    """
    استدعاء نموذج Google Gemini 1.5 Flash لتحليل الوثيقة بصرياً
    مع هيكلة المخرجات بصيغة JSON صارمة متوافقة مع استمارة 21
    """
    if not api_key or not os.path.exists(image_path):
        return None

    try:
        # قراءة الصورة وترميزها إلى Base64
        with open(image_path, "rb") as img_file:
            img_b64 = base64.b64encode(img_file.read()).decode("utf-8")
            
        ext = os.path.splitext(image_path)[1].lower()
        mime_type = "image/jpeg"
        if ext == ".png":
            mime_type = "image/png"
        elif ext == ".pdf":
            mime_type = "application/pdf"

        prompt = f"""أنت خبير متخصص في قراءة وتحليل الوثائق الإدارية العراقية الرسمية المكتوبة بخط اليد أو المطبوعة.
مهمتك: استخراج بيانات الوثيقة بدقة متناهية مع التركيز الخاص على الأرقام المكتوبة بخط اليد.

## دليل تمييز الأرقام العربية المكتوبة بخط اليد:
الأرقام العربية المشرقية (٠١٢٣٤٥٦٧٨٩) تختلف بصرياً عن الأرقام اللاتينية، وخاصةً بخط اليد:

| الرقم | شكله بخط اليد | يُخلط مع | تمييزه |
|-------|--------------|----------|--------|
| ٧ (سبعة) | U أو V مفتوح للأعلى | حرف V أو 1/ | افحص اتجاه الانحناء — مفتوح للأعلى |
| ٢ (اثنان) | r صغيرة أو خطاف صغير متجه للأمام | حرف r لاتيني | في سياق الأرقام دائماً = ٢ |
| ٠ (صفر) | دائرة صغيرة بدون ذيل | حرف o اللاتيني | أصغر من ٥ وبدون ذيل |
| ٥ (خمسة) | دائرة مع ذيل صغير في أسفل اليمين | الصفر ٠ | تميّز بوجود الذيل |
| ٣ (ثلاثة) | ε أو 3 — مفتوح من الجانبين | ٤ (أربعة) | أصغر وأكثر انفتاحاً |
| ٤ (أربعة) | ε أكبر أو 3 — أكثر انغلاقاً من أعلى | ٣ (ثلاثة) | أكبر حجماً |
| ٨ (ثمانية) | A كبيرة أو ع عربية | حرف A لاتيني | في سياق الأرقام = ٨ |
| ١ (واحد) | خط مائل أو رأسي — أحياناً يشبه / | شرطة مائلة | في سياق الأرقام = ١ |
| ٦ (ستة) | يشبه 7 لكن مع حلقة في الأسفل | الرقم 7 | افحص وجود الحلقة |
| ٩ (تسعة) | خطاف معكوس أو q | حرف q | في سياق الأرقام = ٩ |

## تنسيق العدد الإداري العراقي:
الصيغة: [اختصار الجهة]/[رقم تسلسلي] أو [اختصار].[اختصار]/[رقم]
أمثلة حقيقية:
- هـ.ع/739 → قسم هندسة العمارة، العدد 739
- هـ.ع/1799 → نفس القسم، العدد 1799
- م.ع/1509 → مساعد رئيس الجامعة للشؤون العلمية
- د.ت/625 → قسم الدراسات والتخطيط
- ش.ع/43 → الشؤون العلمية
- م و 8/130 → مكتب الوزير، الشعبة 8، العدد 130
- م.ر/51 → مكتب رئيس الجامعة
- م.ج 9/421 → أمانة مجلس الجامعة
- س.ت.ي/14/43 → قسم معين، العدد 14/43

## تنسيق التاريخ:
YYYY/MM/DD حيث السنة 2023-2026 دائماً.
مثال: 2025/04/14 أو 2025/01/12

## اسم التدريسي المستهدف: {faculty_name}
ابحث عن هذا الاسم في الوثيقة وحدد دوره إن وجد.

## أرجع JSON فقط بهذه الحقول:
{{
  "doc_number": "العدد الإداري الكامل (مثل: هـ.ع/739)",
  "date": "التاريخ بصيغة YYYY/MM/DD",
  "subject": "موضوع الوثيقة بعد م/ أو الموضوع/",
  "recipient": "الجهة المعنون إليها بعد إلى/",
  "issuer": "الجهة المصدرة (وزارة/جامعة/كلية/قسم)",
  "matched_faculty_role": "دور التدريسي إن وجد اسمه (رئيس لجنة/عضو/مشرف/باحث)",
  "doc_type": "نوع الوثيقة (أمر إداري/كتاب شكر/شهادة مشاركة/بحث علمي)",
  "suggested_axis": "المحور (axis1/axis2/axis3/axis4)",
  "suggested_paragraph": "رقم الفقرة (1-5)",
  "suggested_score": "الدرجة المقترحة (رقم)",
  "is_handwritten": true,
  "confidence_note": "اذكر هنا أي رقم أو حرف كنت غير متأكد من قراءته بخط اليد"
}}
"""

        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": img_b64
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.05,
                "response_mime_type": "application/json"
            }
        }
        
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(endpoint, data=req_data, headers={"Content-Type": "application/json"})

        
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            if resp.status == 200:
                res_json = json.loads(resp.read().decode("utf-8"))
                candidates = res_json.get("candidates", [])
                if candidates:
                    content_parts = candidates[0].get("content", {}).get("parts", [])
                    if content_parts:
                        raw_text = content_parts[0].get("text", "").strip()
                        raw_text = re.sub(r'^```json\s*|```$', '', raw_text)
                        data = json.loads(raw_text)
                        data["engine_used"] = "gemini_1.5_flash"
                        return data
    except Exception as e:
        print(f"Gemini VLM API Call failed: {e}")
        
    return None


def scan_document_multimodal(
    file_path: str,
    faculty_name: str = "أحمد لؤي أحمد",
    target_axis: Optional[str] = None,
    target_paragraph: Optional[str] = None
) -> Dict[str, Any]:
    """
    المسح الذكي الهجين للوثيقة:
    1. محاولة استخدام Gemini Vision VLM إذا توفر المفتاح والاتصال.
    2. التبديل التلقائي السلس إلى محرك Apple Vision OCR المحلي وقواعد التعرف المتقدمة.
    3. استخراج صناديق التظليل البصري (Bounding Boxes) ومطابقة اسم التدريسي.
    """
    config = load_vlm_config()
    api_key = config.get("gemini_api_key", "")
    engine_pref = config.get("engine", "hybrid")
    gemini_model = config.get("model", "gemini-2.0-flash")

    # 1. تجربة Gemini VLM إذا كان مفعلاً ومفتاحه متاح
    if engine_pref in ("hybrid", "gemini") and api_key:
        vlm_res = call_gemini_vlm_api(file_path, api_key, faculty_name, model=gemini_model)
        if vlm_res:
            # ── تطبيق post-processing على مخرجات Gemini ──
            from core.document_parser import clean_handwritten_token
            import re as _re

            # تنظيف وتصحيح العدد
            raw_num = vlm_res.get("doc_number", "") or ""
            if raw_num and raw_num != "غير محدد":
                cleaned_num = clean_handwritten_token(raw_num)
                # تصحيح أشكال OCR الشائعة في العدد
                cleaned_num = _re.sub(r'\b[VU](\d{2,4})\b', r'7\1', cleaned_num)
                cleaned_num = _re.sub(r'\bA(\d{2,4})\b', r'8\1', cleaned_num)
                cleaned_num = _re.sub(r'(?<=\d)[oO](?=\d)', '0', cleaned_num)
                vlm_res["doc_number"] = cleaned_num

            # تنظيف وتصحيح التاريخ
            raw_date = vlm_res.get("date", "") or ""
            if raw_date and raw_date != "غير محدد":
                cleaned_date = clean_handwritten_token(raw_date)
                cleaned_date = _re.sub(r'\br\.r([0-9])', r'202\1', cleaned_date)
                cleaned_date = _re.sub(r'\b[rR]([0-9]{3})\b', r'2\1', cleaned_date)
                cleaned_date = _re.sub(r'(?<=\d)[oO](?=\d)', '0', cleaned_date)
                cleaned_date = _re.sub(r'\bc[-_\.][Ee][oO0]\b', '2025', cleaned_date)
                # التحقق: هل التاريخ في النطاق المعقول (2020-2030)?
                year_match = _re.search(r'\b(20[2-3][0-9])\b', cleaned_date)
                if year_match:
                    vlm_res["date"] = cleaned_date

            doc_num = vlm_res.get("doc_number", "غير محدد")
            dt = vlm_res.get("date", "غير محدد")
            subj = vlm_res.get("subject", "غير محدد")

            # احتساب صناديق التظليل
            bboxes = calculate_local_bounding_boxes("", doc_num, dt, subj)
            vlm_res["bounding_boxes"] = bboxes
            vlm_res["ocr_success"] = True
            return vlm_res


    # 2. التشغيل عبر محرك الرؤية المحلي (Apple Vision OCR + Smart Entity Matching)
    ocr_res = process_document(file_path)
    raw_text = ocr_res.get("text", "")
    
    # استخراج الـ DOI وسكوباس إن وجد
    doi = extract_doi(raw_text)
    
    from core.document_parser import (
        extract_document_number,
        extract_dates,
        extract_recipient,
        extract_subject_or_title,
        parse_academic_document
    )
    
    filename = os.path.basename(file_path)
    base_parse = parse_academic_document(raw_text, filename)
    
    doc_number = base_parse.get("document_number", "غير محدد")
    date_val = base_parse.get("date", "غير محدد")
    subject_val = base_parse.get("title", filename)
    recipient_val = extract_recipient(raw_text, default="تشكيلات الجامعة كافة")
    
    # فحص اسم التدريسي في الأوامر الجماعية
    matched_role_info = extract_faculty_role_in_order(raw_text, faculty_name)
    if matched_role_info:
        base_parse["suggested_score"] = matched_role_info["suggested_score"]
        base_parse["suggested_paragraph"] = matched_role_info["suggested_paragraph"]
        base_parse["teacher_role"] = matched_role_info["role"]
    
    # حساب صناديق التظليل البصرية
    bboxes = calculate_local_bounding_boxes(raw_text, doc_number, date_val, subject_val, matched_role_info)
    
    return {
        "engine_used": "apple_vision_local",
        "doc_number": doc_number,
        "date": date_val,
        "subject": subject_val,
        "recipient": recipient_val or "تشكيلات الجامعة كافة",
        "issuer": base_parse.get("issuer", "الجهة الرسمية"),
        "doc_type": base_parse.get("document_type_arabic", "وثيقة رسمية"),
        "suggested_axis": target_axis or base_parse.get("suggested_axis", "axis1"),
        "suggested_paragraph": target_paragraph or base_parse.get("suggested_paragraph", "1"),
        "suggested_score": base_parse.get("suggested_score", 10.0),
        "doi": doi,
        "bounding_boxes": bboxes,
        "matched_faculty_info": matched_role_info,
        "handwritten_detected": base_parse.get("handwritten_detected", False),
        "handwritten_fields": base_parse.get("handwritten_fields", []),
        "raw_text": raw_text[:800],
        "ocr_success": ocr_res.get("has_text", False)
    }
