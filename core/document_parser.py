"""
المحلل الذكي للوثائق والمرفقات الأكاديمية الرسمية (Document Parser)
يقوم بفحص النصوص المستخرجة عبر OCR أو PDF، واستخراج البيانات الأساسية:
(نوع الوثيقة، رقم الأمر، التاريخ، الجهة المانحة، العنوان/الموضوع، الدور، والمقاييس)
ثم توجيهها آلياً للمحور والفقرة المناسبة مع احتساب الدرجة المستحقة.
"""
import os
import re
from typing import Dict, Any, List, Optional


class HandwrittenString(str):
    """سلسلة نصية تدعم خصائص خط اليد وقابلية الوصول كـ dict وكـ str"""
    def __new__(cls, value, is_handwritten=False, method="printed"):
        obj = super().__new__(cls, str(value) if value is not None else "")
        obj.value = str(value) if value is not None else ""
        obj.is_handwritten = is_handwritten
        obj.method = method
        return obj

    def get(self, key, default=None):
        if key in ("value", "date"):
            return str(self)
        return getattr(self, key, default)


ARABIC_MONTHS = {
    'كانون الثاني': '01', 'يناير': '01',
    'شباط': '02', 'فبراير': '02',
    'آذار': '03', 'اذار': '03', 'مارس': '03',
    'نيسان': '04', 'ابريل': '04', 'أبريل': '04',
    'أيار': '05', 'ايار': '05', 'مايس': '05', 'مايو': '05',
    'حزيران': '06', 'يونيو': '06',
    'تموز': '07', 'يوليو': '07',
    'آب': '08', 'اب': '08', 'أغسطس': '08', 'اغسطس': '08',
    'أيلول': '09', 'ايلول': '09', 'سبتمبر': '09',
    'تشرين الأول': '10', 'تشرين الاول': '10', 'أكتوبر': '10', 'اكتوبر': '10',
    'تشرين الثاني': '11', 'نوفمبر': '11',
    'كانون الأول': '12', 'كانون الاول': '12', 'ديسمبر': '12'
}


def clean_handwritten_token(raw: str) -> str:
    """تنظيف شوائب المسح الضوئي والأرقام المتباعدة والخطوط المنقطة الناتجة عن خط اليد
    مع معالجة الحروف اللاتينية التي يقرأها OCR بدلاً من الأرقام العربية المكتوبة بالقلم:
      ٧ → يُقرأ كـ V أو U أو 1/
      ٢ → يُقرأ كـ r أو c في بداية أرقام التاريخ
      ٠ → يُقرأ كـ o منفردة بين أرقام
      ٨ → يُقرأ كـ A في بعض الخطوط
      ٩ → يُقرأ كـ q أحياناً
      ٥ → يُقرأ كـ o أو 0 أحياناً (يُميَّز بالسياق)
    """
    if not raw:
        return ""
    val = raw.replace('\\', '/').replace('|', '/').replace('!', '/').replace('I', '/')
    val = re.sub(r'202\s*[\{]', '2024', val)
    val = re.sub(r'2002([0-9])', r'202\1', val)
    val = re.sub(r'^[\s\.\:\-_=/]+|[\s\.\:\-_=/]+$', '', val)
    for _ in range(5):
        val = re.sub(r'(\d)\s+(\d)', r'\1\2', val)
    val = re.sub(r'\s*[/]\s*', '/', val)
    val = re.sub(r'[/]{2,}', '/', val)

    # ── تصحيح OCR لخط اليد العربي ──────────────────────────────────────────
    # ٧ يُكتب كـ U/V مفتوح للأعلى → يُقرأ كـ V أو U
    val = re.sub(r'\b[VU](\d{1,5})\b', r'7\1', val)
    # ٧ يُقرأ أيضاً كـ 1/ في بعض الأحيان (مثل 1/39 → 739)
    val = re.sub(r'(?:^|(?<=\s))1/(\d{2,4})\b', r'7\1', val)
    # ٢ في التاريخ يُقرأ كـ r (مثل r.r5 → 2025 ، r025 → 2025)
    val = re.sub(r'\br\.r([0-9])', r'202\1', val)      # r.r5 → 2025
    val = re.sub(r'\br-([0-9]{3})\b', r'2\1', val)      # r-025 → 2025 نادر
    val = re.sub(r'\b[rR]([0-9]{3})\b', r'2\1', val)    # r025 → 2025
    # ٠ يُقرأ كـ o بين أرقام (مثل 2o25 → 2025)
    val = re.sub(r'(?<=\d)[oO](?=\d)', '0', val)
    # ٨ يُقرأ كـ A في بعض الخطوط (مثل A3/130 → 8... نادر لكن موجود)
    val = re.sub(r'\bA(\d{2,4})\b', r'8\1', val)
    # c-eo / c_eo / c.eo → 2025 (شكل ٢٠٢٥ في خط مائل)
    val = re.sub(r'\bc[-_\.]?[Ee][oO0]\b', '2025', val)
    val = re.sub(r'\bc[-_\.]?[2-9][0-9]\b', lambda m: '20' + m.group(0)[1:].lstrip('-_.'), val)
    # ─────────────────────────────────────────────────────────────────────────

    return val.strip()


def extract_recipient(text: str, default: str = "") -> Optional[str]:
    """
    استخراج الجهة المعنون إليها الوثيقة أو الكتاب (المعنون إليه / إلى / )
    وفق المعايير الرسمية للكتب والمخاطبات الإدارية العراقية
    """
    if not text:
        return default or None

    from core.ocr_engine import normalize_arabic_text
    norm_text = normalize_arabic_text(text)
    lines = [l.strip() for l in norm_text.split('\n') if l.strip()]

    # 1. البحث عن نمط "إلى / ..." في نفس السطر مع فاصل صريح أو صيغة توجيه
    recip_pat = r'(?:(?:\b(?:إلى|الى|إلــى|إلي)\b\s*[/:\-])|(?:معنون\s*إلى|الموجه\s*إلى)\s*[/:\-]?)\s*([^\n\r]+)'
    metadata_stops = ["العدد", "التاريخ", "اليوم", "المادة", "المحاضرة", "القاعة", "الفصل"]
    for idx, line in enumerate(lines):
        m = re.search(recip_pat, line)
        if m:
            val = m.group(1).strip()
            val = re.sub(r'^[-/:\\\s]+', '', val).strip()
            # إذا كان السطر يحتوي فقط على "إلى /" والقيمة فارغة أو قصيرة جداً، نأخذ السطر التالي
            if (not val or len(val) <= 2) and idx + 1 < len(lines):
                val = lines[idx + 1].strip()
            # اقتطاع إذا كان السطر يحتوي على "م/" أو "الموضوع" أو "( م/" أو "تحية طيبة"
            val = re.split(r'\s*(?:(?:^|[\s\(\[])(?:م|الموضوع)\s*[/:\-]|تحية طيبة|السلام عليكم)', val)[0].strip()
            val = re.sub(r'[\(\)\[\]]+$', '', val).strip()
            if sum(1 for c in val if c.isalpha()) >= 3 and not any(k in val for k in metadata_stops):
                return val

    # 2. في حالة سطر مستقل يبدأ بـ "إلى" أو "الى" فقط
    for idx, line in enumerate(lines):
        if re.search(r'^(?:إلى|الى|إلــى|إلي)\s*[/:\-]?\s*$', line) and idx + 1 < len(lines):
            cand = lines[idx + 1].strip()
            cand = re.split(r'\s*(?:(?:^|[\s\(\[])(?:م|الموضوع)\s*[/:\-]|تحية طيبة)', cand)[0].strip()
            if sum(1 for c in cand if c.isalpha()) >= 3 and not any(k in cand for k in metadata_stops):
                return cand

    # 3. في كتب الشكر والخطابات الرسمية التي تذكر المعنون إليه مباشرة فوق سطر "م /" بدون كلمة "إلى"
    header_stops = ["جمهورية", "وزارة", "العدد", "التاريخ", "اليوم", "المادة", "المحاضرة", "القاعة", "الفصل"]
    for idx, line in enumerate(lines):
        if re.search(r'(?:^|[\s\(\[])(?:م|مـ|الموضوع)\s*[/:\-]', line) and idx > 0:
            for prev_idx in range(idx - 1, max(-1, idx - 3), -1):
                prev_line = lines[prev_idx].strip()
                if any(t in prev_line for t in ["المحترم", "المحترمون", "المحترمة", "السيد", "السيدة", "السيدات", "رئيس الجامعة", "عميد", "منتسبي"]):
                    prev_line = re.sub(r'^(?:إلى|الى)\s*[/:\-]?\s*', '', prev_line).strip()
                    if sum(1 for c in prev_line if c.isalpha()) >= 3 and not any(k in prev_line for k in header_stops):
                        return prev_line

    return default or None


def extract_subject_or_title(text: str, filename: str = "", default: str = "") -> str:
    """
    استخراج موضوع الوثيقة أو الكتاب (م / أو الموضوع /) بأعلى دقة ومرونة بالذكاء الاصطناعي
    """
    from core.ocr_engine import normalize_arabic_text
    norm_text = normalize_arabic_text(text) if text else ""
    lines = [l.strip() for l in norm_text.split('\n') if l.strip()]

    # 1. البحث الصريح عن بادئات الموضوع (م/ أو الموضوع/ أو م-) مع اشتراط بداية سطر أو مسافة سابقة
    subj_pat = r'(?:^|[\s\(\[])(?:م|مـ|الموضوع|موضوع)(?:\s*هو)?\s*[/:\-]\s*([^\n\r]+)'
    for idx, line in enumerate(lines):
        m = re.search(subj_pat, line)
        if m:
            val = m.group(1).strip()
            val = re.sub(r'^[-/:\\\s]+', '', val).strip()
            if (not val or len(val) <= 2) and idx + 1 < len(lines):
                val = lines[idx + 1].strip()
            # إذا كان الموضوع ممتداً لسطر إضافي قبل التحية
            if idx + 1 < len(lines):
                next_l = lines[idx + 1].strip()
                if not any(g in next_l for g in ['تحية طيبة', 'السلام', 'تقرر', 'إشارة', 'بناء', 'نظرا', 'تهديكم', 'نهديكم', 'نود', 'تود', 'يرجى']) and len(next_l) > 3 and len(val) < 60:
                    if not re.search(r'^(?:العدد|التاريخ|الى|إلى)', next_l):
                        val += ' ' + next_l
            val = re.split(r'\s*(?:تحية طيبة|السلام عليكم|يرجى التفضل|تقرر ما يأتي|تهديكم|نهديكم)', val)[0].strip()
            val = re.sub(r'[\(\)\[\]]+$', '', val).strip()
            if len(val) >= 3 and not any(k in val for k in ["جمهورية العراق", "وزارة التعليم", "University of", "مفترسة", "مختطفة"]):
                return val[:150]

    # 2. البحث داخل الأقواس: ( م / ... ) أو [ الموضوع : ... ]
    m_paren = re.search(r'[\(\[]\s*(?:م|الموضوع)\s*[/:\-]?\s*([^\)\]]+)[\)\]]', norm_text)
    if m_paren:
        val = m_paren.group(1).strip()
        val = re.sub(r'^[-/:\\\s]+', '', val).strip()
        if len(val) >= 3 and not any(k in val for k in ["مفترسة", "مختطفة"]):
            return val[:150]

    # 3. أنماط الأوامر والقرارات والتقارير الإدارية والمحاضرات والدعوات المباشرة في المتن
    order_patterns = [
        r'(?:المحاضرة\s+(?:الموسومة|النوعية)?\s+[^\n\r.]+)',
        r'(?:(?:دعوة|ندعوكم)\s+لحضور\s+[^\n\r.]+)',
        r'(?:ندوة\s+[^\n\r.]+)',
        r'(?:ورشة\s+عمل\s+[^\n\r.]+)',
        r'(?:تقرير\s+اعتمادية\s+البحوث?[^\n\r.]*)',
        r'(?:اعتمادية\s+البحوث\s+العلمية[^\n\r.]*)',
        r'(?:برنامج\s+تطوير\s+وتأهيل\s+قدرات[^\n\r.]*)',
        r'(?:أمر إداري|أمر جامعي|امر اداري|امر جامعي)\s*[-–:]?\s*([^\n\r.]+)',
        r'(?:تقرر\s+تشكيل\s+لجنة\s+)([^\n\r.]+)',
        r'(?:تكليف\s+(?:السيد|الدكتور|التدريسي)?\s+بـ?\s*)([^\n\r.]+)',
        r'(?:كتاب\s+(?:شكر\s+وتقدير|تأييد|تثمين\s+جهود)\s*)([^\n\r.]+)',
        r'(?:شهادة\s+(?:مشاركة|تقديرية|حضور)\s*)([^\n\r.]+)',
        r'(?:تأييد\s+حضور\s+[^\n\r.]+)',
        r'(?:احتساب\s+(?:عمل\s+تطوعي|خدمة\s+مجتمع)\s*)([^\n\r.]+)',
        r'(?:الجدول\s+(?:الاسبوعي|الأسبوعي)\s+)([^\n\r.]+)'
    ]
    for pat in order_patterns:
        m_ord = re.search(pat, norm_text)
        if m_ord:
            val = m_ord.group(0).strip()
            if len(val) > 4:
                return val[:150]

    # 4. الاستعانة باسم الملف في حال كانت الوثيقة صورة أو مسح ضوئي غير واضح
    if filename:
        clean_fn = re.sub(r'^[0-9a-f\-]+_', '', filename)
        clean_fn = os.path.splitext(clean_fn)[0]
        clean_fn = clean_fn.replace('_', ' ').replace('-', ' ').strip()
        if len(clean_fn) > 3 and not any(k in clean_fn.lower() for k in ['photo', 'screenshot', 'whatsapp', 'archive', 'scan', 'tempimage']):
            return clean_fn

    # 5. الأسطر الأولى متجاهلاً الترويسات الرسمية
    skip_keywords = ["جمهورية", "دوهورية", "بواسورية", "وزارة", "جامعة", "كلية", "قسم", "نقابة", "حوسة", "العدد", "التاريخ", "بسم الله", "شعار", "republic", "ministry", "camscanner", "scanned"]
    for l in lines[:8]:
        if not any(k in l.lower() for k in skip_keywords) and len(l) > 10:
            return l[:120]

    return default or "وثيقة رسمية داعمة"


def extract_dates(text: str, filename: str = "") -> List[HandwrittenString]:
    """
    استخراج التواريخ من النص مع دعم تواريخ خط اليد (الأرقام المتباعدة، الأشهر العربية، والخطوط المنقطة، والملفات)
    """
    if not text and not filename:
        return []

    from core.ocr_engine import normalize_arabic_text
    norm_text = normalize_arabic_text(text) if text else ""

    dates: List[HandwrittenString] = []
    seen = set()

    def add_date(d_str: str, is_hw: bool = False):
        if not d_str:
            return
        clean_d = clean_handwritten_token(d_str)
        # توحيد التنسيق إلى YYYY/MM/DD إن أمكن
        parts = re.split(r'[/\-\.]', clean_d)
        if len(parts) == 3:
            p1, p2, p3 = parts
            try:
                if len(p1) == 4 and p1.startswith('202'):  # YYYY/MM/DD
                    formatted = f"{p1}/{int(p2):02d}/{int(p3):02d}"
                elif len(p3) == 4 and p3.startswith('202'):  # DD/MM/YYYY
                    formatted = f"{p3}/{int(p2):02d}/{int(p1):02d}"
                else:
                    formatted = clean_d
            except ValueError:
                formatted = clean_d
        else:
            formatted = clean_d

        if formatted and formatted not in seen:
            seen.add(formatted)
            dates.append(HandwrittenString(formatted, is_handwritten=is_hw))

    # 1. فحص التواريخ المكتوبة بأسماء الأشهر العربية باليد (مثال: 14 نيسان 2025)
    month_names_pattern = '|'.join(sorted(ARABIC_MONTHS.keys(), key=lambda x: -len(x)))
    textual_date_pat = rf'(\b(?:0?[1-9]|[12][0-9]|3[01]))\s*(?:من\s*)?({month_names_pattern})\s*(?:سنة\s*|عام\s*)?(202[0-9])'
    for m in re.finditer(textual_date_pat, norm_text):
        day, m_name, year = m.groups()
        m_num = ARABIC_MONTHS.get(m_name, '01')
        formatted = f"{year}/{m_num}/{int(day):02d}"
        add_date(formatted, is_hw=True)

    # 2. فحص التواريخ بجانب كلمة التاريخ أو التأريخ بخط اليد مع نقاط أو فراغات
    # تم توسيع النمط ليشمل أحرف OCR المشوَّهة مثل r.r5 أو c-eo بدلاً من 2025
    labeled_date_pat = r'(?:التاريخ|التأريخ|بتاريخ|بتأريخ|تاريخ\s+الصدور|تاريخ|Date|DATE)\s*[:/=\-A-Za-z.]*\s*[.\s]*([0-9rRcCoOVU/\-\. \{]{4,30})'
    for m in re.finditer(labeled_date_pat, norm_text):
        cand = m.group(1).strip()
        is_hw = bool(re.search(r'\.{2,}', cand) or re.search(r'\d\s+\d', cand) or '/' in cand
                     or re.search(r'[rRcCoO]', cand))
        # تطبيق تصحيحات OCR خط اليد على المرشح
        cand = re.sub(r'\br\.r([0-9])', r'202\1', cand)       # r.r5 → 2025
        cand = re.sub(r'\b[rR]([0-9]{3})\b', r'2\1', cand)    # r025 → 2025
        cand = re.sub(r'(?<=\d)[oO](?=\d)', '0', cand)        # 2o25 → 2025
        cand = re.sub(r'\bc[-_\.][Ee][oO0]\b', '2025', cand)  # c-eo → 2025
        cand = re.sub(r'\bc[-_\.]([3-9][0-9])\b', r'20\1', cand)  # c-25 → 2025
        cand = re.sub(r'\b[VU](\d{1,2})\b', r'7\1', cand)     # V4 → 74 (شهر/يوم)
        cleaned = clean_handwritten_token(cand)
        m_date = re.search(r'\b(202[0-9][/\-\.](?:0?[1-9]|1[0-2])[/\-\.](?:0?[1-9]|[12][0-9]|3[01]))\b', cleaned)
        if m_date:
            add_date(m_date.group(1), is_hw=is_hw)
            continue
        m_date2 = re.search(r'\b((?:0?[1-9]|[12][0-9]|3[01])[/\-\.](?:0?[1-9]|1[0-2])[/\-\.]202[0-9])\b', cleaned)
        if m_date2:
            add_date(m_date2.group(1), is_hw=is_hw)


    # 3. فحص التواريخ في السطور التالية لكلمة التاريخ (حتى 3 أسطر لدعم التواريخ متعددة الأسطر)
    lines = [l.strip() for l in norm_text.split('\n') if l.strip()]
    for idx, line in enumerate(lines):
        if re.search(r'^(?:التاريخ|التأريخ|تاريخ\s+الصدور|بتاريخ|بتأريخ|Date|DATE)\s*[:/=-]?\s*[\.]*$', line):
            cand_parts = []
            for j in range(idx + 1, min(idx + 4, len(lines))):
                sub = lines[j].strip()
                if re.search(r'\b\d{1,2}/\d{1,2}\b', sub):
                    cand_parts.append(sub)
                elif re.match(r'^202[0-9]$', sub):
                    cand_parts.append(sub)
            if len(cand_parts) == 2:
                p_dm = cand_parts[0] if "/" in cand_parts[0] else cand_parts[1]
                p_y = cand_parts[1] if "/" in cand_parts[0] else cand_parts[0]
                m_dm = re.match(r'(\d{1,2})/(\d{1,2})', p_dm)
                if m_dm:
                    d1, d2 = int(m_dm.group(1)), int(m_dm.group(2))
                    day = max(d1, d2)
                    month = min(d1, d2)
                    add_date(f"{p_y}/{month:02d}/{day:02d}", is_hw=True)
            elif idx + 1 < len(lines):
                cand_next = clean_handwritten_token(lines[idx + 1])
                m_next = re.search(r'\b(202[0-9][/\-\.](?:0?[1-9]|1[0-2])[/\-\.](?:0?[1-9]|[12][0-9]|3[01]))\b', cand_next)
                if m_next:
                    add_date(m_next.group(1), is_hw=True)
                else:
                    m_next2 = re.search(r'\b((?:0?[1-9]|[12][0-9]|3[01])[/\-\.](?:0?[1-9]|1[0-2])[/\-\.]202[0-9])\b', cand_next)
                    if m_next2:
                        add_date(m_next2.group(1), is_hw=True)

    # 4. الأنماط الرقمية القياسية في كامل النص
    patterns = [
        r'\b(202[0-9][/\-\.](?:0?[1-9]|1[0-2])[/\-\.](?:0?[1-9]|[12][0-9]|3[01]))\b',
        r'\b((?:0?[1-9]|[12][0-9]|3[01])[/\-\.](?:0?[1-9]|1[0-2])[/\-\.]202[0-9])\b',
        r'\b(202[0-9][/\-]202[0-9])\b',
        r'\b(202[0-9])\b'
    ]
    norm_slash = re.sub(r'\s*[/]\s*', '/', norm_text)
    for pat in patterns:
        for m in re.finditer(pat, norm_slash):
            add_date(m.group(1), is_hw=False)

    # 5. استخراج التاريخ من اسم الملف كخيار احتياطي أخير فقط إذا لم يُعثر على أي تاريخ داخل متن الوثيقة
    if filename and not dates:
        is_camera = bool(re.search(r'(?:PHOTO|IMG|PXL|Screenshot|WhatsApp|tempImage)', filename, re.I))
        if not is_camera:
            fn_date = None
            m_fn = re.search(r'\b(202[0-9])[-_](0?[1-9]|1[0-2])[-_](0?[1-9]|[12][0-9]|3[01])\b', filename)
            if m_fn:
                y, m, d = m_fn.groups()
                fn_date = f"{y}/{int(m):02d}/{int(d):02d}"
            else:
                m_fn_arch = re.search(r'Archive_([0-9]{2})_([0-9]{2})_(202[0-9])', filename)
                if m_fn_arch:
                    m, d, y = m_fn_arch.groups()
                    fn_date = f"{y}/{int(m):02d}/{int(d):02d}"

            if fn_date and fn_date not in seen:
                add_date(fn_date, is_hw=False)

    return dates


def infer_department_abbreviation(lines: List[str]) -> str:
    """
    استنتاج حروف اختصار القسم أو الجهة المانحة من ترويسة الوثيقة الرسمية
    (مثال: قسم هندسة العمارة -> هـ.ع / قسم الدراسات والتخطيط -> د.ت / مكتب المساعد العلمي -> م.ع / مكتب رئيس الجامعة -> م.ر)
    مع استبعاد أسطر الجهة المعنون إليها (إلى /) والمخاطب (المحترم/المحترمة) وعبارات التحية والإحالة
    وفي حالة عدم تطابق أي قسم يتم إرجاع سلسلة فارغة دون فرض بادئة مصطنعة.
    """
    import re
    sender_lines = []
    for l in lines[:15]:
        if re.search(r'^\s*(?:إلى|الى|لإلى)\b|المحترم|المحترمة|المحترمون|تهديكم|نهديكم|نرفق|تحية طيبة', l):
            continue
        sender_lines.append(l)
    header_text = " ".join(sender_lines)
    header_text = re.sub(r'[\u064B-\u065F\u0670]', '', header_text)

    if any(k in header_text for k in ["أمانة مجلس الجامعة", "مجلس الجامعة"]):
        return "م.ج"
    if any(k in header_text for k in ["مكتب رئيس الجامعة", "مصكتب رئيس", "رئيس المامعة", "رئيس الجامعة", "Office of The President", "President Office"]):
        return "م.ر"
    if any(k in header_text for k in ["مساعد رئيس الجامعة للشؤون العلمية", "المعاون العلمي"]):
        return "م.ع"
    if any(k in header_text for k in ["مساعد رئيس الجامعة للشؤون الادارية", "المعاون الاداري"]):
        return "م.إ"
    if any(k in header_text for k in ["الدراسات والتخطيط", "الدراسات و التخطيط"]):
        return "د.ت"
    if any(k in header_text for k in ["الشؤون الإدارية والمالية", "قسم الشؤون الادارية", "الشؤون الادارية"]):
        return "ش.إ"
    if any(k in header_text for k in ["هندسة العمارة", "قسم العمارة", "فرع التصميم المعماري", "التصميم المعماري", "عماره", "عمارة"]):
        return "هـ.ع"
    if any(k in header_text for k in ["وزير التعليم العالي", "مكتب الوزير", "معالي الوزير"]):
        return "م.و"
    if any(k in header_text for k in ["الشؤون العلمية", "شعبة المجلات"]):
        return "ش.ع"
    if "جهاز الاشراف" in header_text or "جهاز الإشراف" in header_text:
        return "ج.م"
    if any(k in header_text for k in ["العميد", "العمادة"]):
        return "ع"
    return ""


def clean_handwritten_doc_number(raw_line: str, dept_hint: str = "", next_line: str = "") -> Optional[HandwrittenString]:
    """
    استخراج وصياغة العدد الإداري وفق القاعدة الرسمية الصارمة للكتب والوثائق العراقية:
    [حروف باللغة العربية بينها نقطة '.' أو بدونها] / [رقم تسلسلي بالأرقام العربية]
    مع إظهار الحروف العربية بخط اليد دائماً (مثل هـ.ع/734 ، هـ.ع/1799 ، م.ع/1509 ، ش.ع/43 ، م و 8 / 135)
    مع إزالة التشويش وثنائية اللغة الإنجليزية (Ref, NO, Rer) وتصحيح كتابة الرقم ٧ بخط اليد.
    """
    import re
    from core.ocr_engine import normalize_arabic_text
    if not raw_line:
        return None

    # استبعاد أسطر الإحصائيات والأعداد العامة مثل "عدد الطلبة" أو "عدد المواد"
    if re.search(r'\bعدد\s*(?:الطلبة|المواد|الساعات|المشاركين|البحوث|الحضور|الصفحات|المقاعد|الدراسات|المحاضرات|الأيام|الاسابيع|الأشهر|السنوات)', raw_line):
        return None

    # استبعاد نصوص الدوريات والكتب بالإنجليزية التي تحتوي على References
    if re.search(r'(?i)\b(?:references|citations|abstract|contents)\b', raw_line):
        return None

    line = normalize_arabic_text(raw_line)
    dept_hint = dept_hint or ""

    # 0. فصل الحروف العربية عن الحروف اللاتينية المتصلة بها خطأ في OCR (مثل هRef -> ه Ref)
    line = re.sub(r'([\u0600-\u06FF])([A-Za-z])', r'\1 \2', line)
    line = re.sub(r'([A-Za-z])([\u0600-\u06FF])', r'\1 \2', line)

    # 1. إزالة كلمة 'العدد' أو مرادفاتها في بداية السطر حتى مع أخطاء OCR الشائعة (سد: أو العد: أو سـد:)
    line = re.sub(r'^(?:العدد|الـعـدد|رقم|الرقم|عدد|العد|الـعد|سد|سـد)\s*[:/=-]?\s*', '', line.strip())

    # 2. إزالة التسميات الإنجليزية الثنائية مثل Ref. أو No: أو Date: أو Rer:
    # 2. إزالة التسميات الإنجليزية الثنائية مثل Ref. أو No: أو Date: أو Rer: أو Bel:
    line = re.sub(r'(?i)\b(?:ref|no|date|rer|bel|rel)\b[\.:]*', ' ', line)
    line = re.sub(r'(?i)\bR[0-9e]\b[\.:]*', ' ', line)

    # معالجة مكتب الوزير المكتوب كـ 2و أو ٢و
    line = re.sub(r'\b[2٢]\s*و\b', 'م و', line)
    line = re.sub(r'[2٢]\s*و\s*([0-9])', r'م و \1', line)

    # معالجة قراءة ترويسة قسم العمارة المطبوعة (8-/4 أو 8- / 4 أو /4 5 أو /45) وتحويلها إلى هـ.ع/
    line = re.sub(r'[8٨]\s*-\s*[/]\s*4\b', 'هـ.ع/', line)
    line = re.sub(r'\s*[/]\s*(?:4\s*5|5\s*4|45|54)\b', ' / هـ.ع', line)
    line = re.sub(r'\s+[45]\s*5\b', ' ', line)

    # معالجة أخطاء OCR الشائعة لاختصارات الكتب الإدارية
    # 40202 أو 4022 أو 20202 -> مع (مساعد علمي)
    line = re.sub(r'40202|4022|20202', 'مع', line)
    # أسر أو أمر في سطر العدد -> أ.م (أمر إداري)
    line = re.sub(r'(?:^|\s)(?:أسر|امر|أمر|أم|أ\.م|اسر)(?=\s|\d|$)', ' أ.م', line)

    # معالجة مكتب رئيس الجامعة: "51 / 40/2" أو "40/2" -> م.ر 1
    line = re.sub(r'40\s*/\s*2\b', 'م.ر 1', line)

    # تصحيح قراءة الرقم 1 المكتوب بخط اليد المائل الذي يقرأه OCR كـ \ أو / (مثل \799 -> 1799)
    line = re.sub(r'\\(\d+)', r'1\1', line)
    line = re.sub(r'(?:^|\s)[/|!](7\d{2,3})\b', r' 1\1', line)

    line = line.replace('|', '/').replace('\\', '/').replace('!', '/')

    # 3. دمج الأرقام المتبابعة والخطوط المنقطة
    for _ in range(3):
        line = re.sub(r'(\d)\s+(\d)', r'\1\2', line)

    # 4. تصحيح قراءة الأرقام العربية المكتوبة بخط اليد وفق خصائص كل رقم:
    # ── ٧ (سبعة): يُكتب كـ U أو V مفتوح للأعلى
    line = re.sub(r'(?:\b|(?<=[^0-9]))1/([\d]{2,4})', r'7\1', line)  # 1/39 → 739
    line = re.sub(r'\b[VU](\d{2,4})\b', r'7\1', line)                  # V39 → 739
    # ── ٨ (ثمانية): يُكتب كـ A في بعض الخطوط أو كـ ع
    line = re.sub(r'\bA(\d{2,4})\b', r'8\1', line)                     # A30 → 830
    # ── ٠ (صفر): يُقرأ كـ o بين أرقام
    line = re.sub(r'(?<=\d)[oO](?=\d)', '0', line)                     # 2o25 → 2025
    # ── ٩ (تسعة): يُقرأ كـ q في بعض الأحيان
    line = re.sub(r'\bq(\d{0,3})\b', r'9\1', line)                     # q → 9
    # ── ٢ (اثنان): يُقرأ كـ r في بداية التواريخ  
    line = re.sub(r'\br\.r([0-9])\b', r'202\1', line)                  # r.r5 → 2025
    line = re.sub(r'\b[rR]([0-9]{3})\b', r'2\1', line)                 # r025 → 2025
    # ── تصحيح سنة 202X المكتوبة كـ c-eo أو c_25 أو c.50
    line = re.sub(r'\bc[-_\.][Ee][oO0]\b', '2025', line)               # c-eo → 2025
    line = re.sub(r'\bc[-_\.]([3-9][0-9])\b', r'20\1', line)           # c-25 → 2025


    # معالجة قسم الشؤون العلمية: "م 43/4" أو "م 43 / 4" -> ش.ع/43
    line = re.sub(r'\bم\s+(\d{1,4})[/](\d)\b', r'ش.ع/\1', line)
    # معالجة اشتباه الحروف بخط اليد: في قسم الشؤون العلمية يُكتب "ش ع" بخط متصل يقرأه OCR كـ "مش"
    line = re.sub(r'\b(?:مش)\b', 'ش.ع', line)
    if dept_hint in ["ش.ع", "ش ع"] or "ش" in line:
        line = re.sub(r'\b(?:مش|م)\s+', 'ش.ع/', line)
        line = re.sub(r'\b(?:مش|م)\b', 'ش.ع', line)

    # 5. تنظيف السلاش والنقاط
    line = re.sub(r'\s*[/]\s*', '/', line)
    line = re.sub(r'\s*[\.]\s*', '.', line)
    line = re.sub(r'[\.]{2,}', '', line)

    # نمط أمانة مجلس الجامعة (م ج / 421 / 9 -> م.ج 9 / 421)
    m_cj = re.search(r'(?:م\s*[\.]?\s*ج)\s*[/]?\s*(\d{2,5})\s*[/]\s*(\d{1,2})', line)
    if m_cj:
        return HandwrittenString(f"م.ج {m_cj.group(2)} / {m_cj.group(1)}", is_handwritten=True)

    # 6. النمط أ: الأرقام المنتهية بلاحقة حرف أو اختصار في نهايتها (مثل 10425/7/ص أو 1258/ق أو 9988/أ أو 1509/مع أو 51 / م.ر 1)
    m_suf = re.search(r'(\d{1,6}(?:[/]\d+)*)\s*[/]\s*([أ-ي](?:[\.][أ-ي]|[أ-ي]){0,3}(?:\s*\d{1,2})?)\b', line)
    if m_suf:
        serial = m_suf.group(1).strip()
        code = m_suf.group(2).strip()
        m_div_code = re.search(r'^(.*?)\s*(\d{1,2})$', code)
        div_code = ""
        if m_div_code:
            code = m_div_code.group(1).strip()
            div_code = m_div_code.group(2).strip()
        clean_code = code.replace('.', '').replace(' ', '')
        if clean_code == 'مع':
            return HandwrittenString(f"م.ع/{serial}", is_handwritten=True)
        elif clean_code in ['هع', 'هـع']:
            return HandwrittenString(f"هـ.ع/{serial}", is_handwritten=True)
        elif clean_code in ['مش', 'شع']:
            return HandwrittenString(f"ش.ع/{serial}", is_handwritten=True)
        elif clean_code == 'دت':
            return HandwrittenString(f"د.ت/{serial}", is_handwritten=True)
        elif clean_code in ['ام', 'أم', 'أسر']:
            return HandwrittenString(f"أ.م/{serial}", is_handwritten=True)
        elif clean_code in ['مر']:
            if div_code:
                return HandwrittenString(f"م.ر {div_code} / {serial}", is_handwritten=True)
            return HandwrittenString(f"م.ر/{serial}", is_handwritten=True)
        elif clean_code in ['مج']:
            if div_code:
                return HandwrittenString(f"م.ج {div_code} / {serial}", is_handwritten=True)
            return HandwrittenString(f"م.ج/{serial}", is_handwritten=True)
        elif clean_code in ['ص', 'ق', 'أ', 'ت']:
            return HandwrittenString(f"{serial}/{code}", is_handwritten=True)
        elif len(clean_code) == 2 and not '.' in code:
            return HandwrittenString(f"{clean_code[0]}.{clean_code[1]}/{serial}", is_handwritten=True)
        return HandwrittenString(f"{serial}/{code}", is_handwritten=True)

    # 7. إزالة تشويش الشهر المنفرد في نهاية السطر الناتج عن تداخل سطر التاريخ أسفله فقط إن تطابق
    m_trail = re.search(r'/([1-9])$', line.strip())
    if m_trail and next_line:
        d_val = m_trail.group(1)
        if re.search(r'[/_\-\s]' + d_val + r'[/_\-\s]', next_line):
            line = re.sub(r'/' + d_val + r'$', '', line.strip())
    line = line.strip()

    # الصيغة 1: حروف عربية بنقاط أو بدونها مع رقم شعبة اختياري + سلاش / + رقم تسلسلي (مثل م و 8 / 135 ، ش ع / 43 ، د.ت/625 ، هـ.ع/734 ، م.ع/1509 ، ش.ع/43)
    m1 = re.search(r'([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4}(?:\s*\d{1,2})?)\s*[/]\s*(\d{1,6}(?:[/]\d+)*)', line)
    if m1:
        letters = m1.group(1).strip()
        serial = m1.group(2).strip()
        m_div = re.search(r'^(.*?)\s*(\d{1,2})$', letters)
        div_num = ""
        if m_div:
            letters = m_div.group(1).strip()
            div_num = m_div.group(2).strip()

        clean_code = letters.replace(".", "").replace(" ", "")
        if letters in ["ه", "هـ"]:
            letters = dept_hint or "هـ.ع"
        elif clean_code in ["مش", "شع", "ش"]:
            letters = "ش.ع"
        elif letters == "م" and dept_hint in ["ش.ع", "ش ع"]:
            letters = "ش.ع"
        elif clean_code in ["مو", "2و"] or letters in ["م و", "م.و"]:
            letters = "م و" if div_num else "م.و"
        elif clean_code == "دت":
            letters = "د.ت"
        elif clean_code == "مع":
            letters = "م.ع"
        elif clean_code in ["هع", "هـع"]:
            letters = "هـ.ع"
        elif clean_code in ["ام", "أم", "أسر"]:
            letters = "أ.م"
        elif clean_code in ["مر"]:
            letters = "م.ر"
        elif len(clean_code) == 2 and "." not in letters:
            letters = f"{clean_code[0]}.{clean_code[1]}"

        if clean_code in ["مش", "شع"]:
            if div_num:
                return HandwrittenString(f"ش.ع/{div_num}", is_handwritten=True)
            return HandwrittenString(f"ش.ع/{serial}", is_handwritten=True)

        if div_num:
            return HandwrittenString(f"{letters} {div_num} / {serial}", is_handwritten=True)
        return HandwrittenString(f"{letters}/{serial}", is_handwritten=True)

    # الصيغة 2: حروف عربية ثم مسافة ثم رقم تسلسلي (مثل ه 734 أو ش ع 43 أو هـ 1799)
    m2 = re.search(r'([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4})\s*[:\s]\s*(\d{2,6}(?:[/]\d+)*)', line)
    if m2:
        letters = m2.group(1).strip()
        serial = m2.group(2).strip()
        clean_code = letters.replace(".", "").replace(" ", "")
        if letters in ["العدد", "عدد", "رقم", "العد", "سد"]:
            return HandwrittenString(serial, is_handwritten=True)
        elif letters in ["ه", "هـ"]:
            letters = dept_hint or "هـ.ع"
        elif clean_code in ["مش", "شع", "ش"]:
            letters = "ش.ع"
        elif letters == "م" and dept_hint in ["ش.ع", "ش ع"]:
            letters = "ش.ع"
        elif clean_code in ["مو", "2و"] or letters in ["م و", "م.و"]:
            letters = "م.و"
        elif clean_code == "دت":
            letters = "د.ت"
        elif clean_code == "مع":
            letters = "م.ع"
        elif clean_code in ["هع", "هـع"]:
            letters = "هـ.ع"
        elif clean_code in ["ام", "أم", "أسر"]:
            letters = "أ.م"
        elif clean_code in ["مر"]:
            letters = "م.ر"
        elif len(clean_code) == 2 and "." not in letters:
            letters = f"{clean_code[0]}.{clean_code[1]}"
        if letters:
            return HandwrittenString(f"{letters}/{serial}", is_handwritten=True)
        return HandwrittenString(serial, is_handwritten=True)

    # الصيغة 3: رقم تسلسلي متبوع بسلاش أو مسافة وحروف عربية (مثل 1509/مع أو 734/هـ أو 1799 هـ.ع)
    m3 = re.search(r'(\d{2,6})\s*(?:[/]|\s+)\s*([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4})', line)
    if m3:
        serial = m3.group(1).strip()
        letters = m3.group(2).strip()
        clean_code = letters.replace(".", "").replace(" ", "")
        if clean_code == "مع":
            letters = "م.ع"
        elif clean_code in ["هع", "هـع"]:
            letters = "هـ.ع"
        elif clean_code in ["مش", "شع"]:
            letters = "ش.ع"
        elif clean_code in ["ام", "أم", "أسر"]:
            letters = "أ.م"
        elif clean_code in ["مر"]:
            letters = "م.ر"
        elif letters in ["ه", "هـ"]:
            letters = dept_hint or "هـ.ع"
        return HandwrittenString(f"{letters}/{serial}", is_handwritten=True)

    # الصيغة 4: رقم مركب بالأرقام (مثل 10425/7 أو 9988/2)
    m_comp = re.search(r'\b(\d{2,6}(?:[/]\d+)+)\b', line)
    if m_comp:
        serial = m_comp.group(1).strip()
        return HandwrittenString(serial, is_handwritten=True)

    # الصيغة 5: رقم تسلسلي بسيط من 2 إلى 6 خانات
    line_body = re.sub(r'^(?:العدد|الـعـدد|رقم|الرقم|عدد|العد|الـعد|سد|سـد)\s*[:/=-]?\s*', '', raw_line).strip()
    m4 = re.search(r'\b(\d{2,6})\b', line_body)
    if m4:
        serial = m4.group(1).strip()
        if dept_hint == "هـ.ع" and any(c in line_body for c in ["ه", "هـ", "ع"]):
            return HandwrittenString(f"هـ.ع/{serial}", is_handwritten=True)
        return HandwrittenString(serial, is_handwritten=True)

    return None


def extract_document_number(text: str, filename: str = "") -> Optional[HandwrittenString]:
    """
    استخراج رقم الأمر أو العدد أو الإشارة من النص مع دعم الأرقام المكتوبة بخط اليد
    وفق الصيغة القياسية: حروف باللغة العربية بينها نقطة '.' أو بدونها ومن ثم '/' متبوعة برقم تسلسلي
    """
    if not text and not filename:
        return None

    from core.ocr_engine import normalize_arabic_text
    norm_text = normalize_arabic_text(text) if text else ""
    lines = [l.strip() for l in norm_text.splitlines() if l.strip()]
    dept_hint = infer_department_abbreviation(lines)

    # 1. فحص الأسطر المتضمنة كلمة العدد أو الرقم أو الصادرة في أول 25 سطراً مع تدقيق صارم لحدود الكلمات
    labels = r'(?:العدد|الـعـدد|رقم|الرقم|صادرة|ع/|ر/|ش\.ص/|سد|سـد|العد|الـعد|\b(?:No|NO|Ref|REF|Rer|Bel|Rel)\b|\bعدد\s*[:/=-])'
    for idx, line in enumerate(lines[:25]):
        if re.search(r'\bعدد\s*(?:الطلبة|المواد|الساعات|المشاركين|البحوث|الحضور|الصفحات)\b', line):
            continue
        if re.search(r'(?i)\b(?:references|citations|abstract)\b', line):
            continue

        if re.search(labels, line):
            # فحص السطر السابق مباشرة إذا كان يحتوي على رقم وسلاش (مثل 1804 / 5 أعلى كلمة Bel/Ref)
            if idx > 0 and re.search(r'(\d{2,5})\s*[/]\s*(?:5|4|ه)', lines[idx - 1]):
                m_prev = re.search(r'(\d{2,5})\s*[/]\s*(?:5|4|ه)', lines[idx - 1])
                pref = dept_hint or "هـ.ع"
                return HandwrittenString(f"{pref}/{m_prev.group(1)}", is_handwritten=True)

            next_l = lines[idx + 1] if idx + 1 < len(lines) else ""
            res = clean_handwritten_doc_number(line, dept_hint, next_l)
            if res:
                return res

            # دمج أسطر متتالية (مثل العدد : \n 2و8/ \n 136) مع تجنب دمج سطر التاريخ
            for span in range(2, 5):
                if idx + span <= len(lines):
                    chunk = " ".join(lines[idx:idx + span])
                    if re.search(r'(?:تاريخ|date)', chunk, re.IGNORECASE):
                        continue
                    chunk = re.sub(r'\b[2٢]\s*و\b', 'م و', chunk)
                    chunk = re.sub(r'[2٢]\s*و\s*([0-9])', r'م و \1', chunk)
                    next_cand = lines[idx + span] if idx + span < len(lines) else ""
                    res_span = clean_handwritten_doc_number(chunk, dept_hint, next_cand)
                    if res_span:
                        return res_span

            # معالجة تباعد الأسطر عند وجود بادئة مفتوحة مثل "م و 8 /" مع رقم تسلسلي مفصول بأسطر التاريخ
            for k in range(idx, min(idx + 3, len(lines))):
                sub_l = re.sub(r'^(?:العدد|الـعـدد|رقم|الرقم|عدد)\s*[:/=-]?\s*', '', lines[k]).strip()
                sub_l = re.sub(r'\b2\s*و\b', 'م و', sub_l)
                m_pref = re.search(r'^([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4}(?:\s*\d{1,2})?)\s*[/]\s*$', sub_l)
                if m_pref:
                    pref = m_pref.group(1).strip()
                    for j in range(k + 1, min(k + 6, len(lines))):
                        cand = lines[j].strip()
                        if re.match(r'^(?:202[0-9]|19\d\d)$', cand) or '/' in cand or ':' in cand or any(c in cand for c in ["مكتب", "وزير", "تاريخ", "جامعة"]):
                            continue
                        m_num = re.search(r'^\b(\d{1,5})\b$', cand)
                        if m_num:
                            serial = m_num.group(1)
                            combined_str = f"{pref} / {serial}"
                            res_comb = clean_handwritten_doc_number(combined_str, dept_hint)
                            if res_comb:
                                return res_comb
                            return HandwrittenString(combined_str, is_handwritten=True)

    # 2. فحص الأسطر التي تحتوي على نمط صريح: حروف / أرقام (مثل د.ت/625 أو هـ.ع/734)
    for idx, line in enumerate(lines[:25]):
        if any(k in line for k in ["التاريخ", "التأريخ", "تاريخ", "Date", "DATE"]):
            continue
        if re.search(r'[أ-ي]\s*[\.]?\s*[أ-ي]?\s*[/]\s*\d{2,6}', line):
            res = clean_handwritten_doc_number(line, dept_hint)
            if res:
                return res

    # 2.ب فحص معرفات أوراق التقييم والمراجعات العلمية من اسم الملف (مثل submission 285)
    if filename and "submission" in filename.lower():
        m_sub = re.search(r'\bsubmission\s*(\d{2,6})\b', filename, re.IGNORECASE)
        if m_sub:
            return HandwrittenString(f"submission {m_sub.group(1)}", is_handwritten=False)

    # 3. نمط الأوامر الإدارية والجامعية الصريحة في المتن (مثل أمر جامعي ذي العدد د.ت/46)
    order_pat = r'(?:أمر إداري|أمر جامعي|امر اداري|امر جامعي)\s*(?:رقم|المرقم|بالعدد|ذي العدد)?\s*([0-9A-Za-z\u0600-\u06FF/\-_!|\\\. ]+)'
    m_order = re.search(order_pat, norm_text)
    if m_order:
        raw_val = m_order.group(1)
        res_order = clean_handwritten_doc_number(raw_val, dept_hint)
        if res_order:
            return res_order

    # 4. أرقام الشهادات والزمالات الدولية بالإنجليزية (مثل Fellowship reference PR075557)
    m_fellow = re.search(r'(?:Fellowship\s*reference|Certificate\s*No|License\s*No)[\s:]*([A-Z0-9\-]+)', norm_text, re.IGNORECASE)
    if m_fellow:
        f_num = m_fellow.group(1).strip()
        if len(f_num) >= 4 and not f_num.lower().startswith("no"):
            return HandwrittenString(f_num, is_handwritten=False)

    # 5. الاستعانة بالرقم عالي الثقة من اسم الملف فقط للأوامر الإدارية والجامعية والقرارات
    if filename:
        clean_fn = re.sub(r'^[0-9a-f\-]+_', '', filename)
        if not any(k in clean_fn.lower() for k in ['photo', 'screenshot', 'whatsapp', 'archive', 'تقرير', 'اعتمادية', 'سيرة', 'جدول']):
            m_fn = re.search(r'(?:أمر\s*جامعي|أمر\s*إداري|امر\s*جامعي|امر\s*اداري|قرار|شكر\s*وتقدير).*?(\d{2,6})\b', clean_fn)
            if m_fn:
                cand_fn = m_fn.group(1)
                if not (len(cand_fn) == 4 and cand_fn.startswith('202')):
                    if dept_hint:
                        return HandwrittenString(f"{dept_hint}/{cand_fn}", is_handwritten=True)
                    return HandwrittenString(cand_fn, is_handwritten=True)

    return None


def extract_doi_or_issn(text: str) -> Dict[str, Optional[str]]:
    """استخراج DOI و ISSN و ISBN إن وجد"""
    doi_match = re.search(r'\b(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)\b', text)
    issn_match = re.search(r'\b(\d{4}-\d{3}[\dX])\b', text)
    isbn_match = re.search(r'\b(97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9])\b', text)
    citescore_match = re.search(r'(?:CiteScore|citescore|Cite Score)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)', text, re.IGNORECASE)
    h_index_match = re.search(r'(?:h-index|H-index|معامل هيرش)\s*[:=]?\s*([0-9]+)', text, re.IGNORECASE)

    return {
        "doi": doi_match.group(1) if doi_match else None,
        "issn": issn_match.group(1) if issn_match else None,
        "isbn": isbn_match.group(1) if isbn_match else None,
        "citescore": float(citescore_match.group(1)) if citescore_match else None,
        "h_index": int(h_index_match.group(1)) if h_index_match else None
    }


def parse_academic_document(text: str, filename: str = "") -> Dict[str, Any]:
    """
    تحليل الوثيقة وتصنيفها واقتراح المحور والفقرة والدرجة المستحقة
    مع استخراج الموضوع (م/ ) والجهة المعنون إليها (إلى/ ) وقراءة خط اليد
    """
    recipient = extract_recipient(text)
    subject = extract_subject_or_title(text, filename)
    dates = extract_dates(text, filename)
    doc_number = extract_document_number(text, filename)
    identifiers = extract_doi_or_issn(text)
    combined_text = (filename + " " + text + " " + (subject or "")).lower()

    # تحديد التاريخ الأنسب للوثيقة
    primary_date = "2025/2026"
    if dates:
        is_camera = bool(re.search(r'(?:PHOTO|IMG|PXL|Screenshot|WhatsApp|tempImage)', filename, re.I))
        matched_date = None
        if not is_camera:
            clean_fn_d = filename.replace("-", "_").replace(".", "_")
            m_fn_d = re.search(r'(\d{1,2})_(\d{1,2})_(\d{4})|(\d{4})_(\d{1,2})_(\d{1,2})', clean_fn_d)
            if m_fn_d:
                nums = [g for g in m_fn_d.groups() if g]
                fn_nums = [n.lstrip("0") for n in nums]
                best_score = 0
                for d in dates:
                    d_str = str(d)
                    d_parts = [p.lstrip("0") for p in re.split(r'[/\-_.]', d_str) if p]
                    score = sum(1 for p in d_parts if p in fn_nums)
                    if score > best_score:
                        best_score = score
                        matched_date = d
        primary_date = matched_date or dates[0]

    # -------------------------------------------------------------------------
    # 1. كتب الشكر والتقدير (Thank you / Appreciation letters)
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["شكر وتقدير", "شكرا وتقديرا", "تثمين جهود", "كتاب شكر", "شهادة تقديرية", "نثمن جهودكم", "شكراً وتقديراً"]):
        is_appreciation = "تثمين" in combined_text or "شهادة تقديرية" in combined_text
        
        if any(k in combined_text for k in ["وزير التعليم العالي", "السيد الوزير", "معالي الوزير", "أمر وزاري"]):
            issuer = "معالي وزير التعليم العالي والبحث العلمي"
            score = 10.0 if is_appreciation else 20.0
            desc = "كتاب شكر من الوزير (20 درجة) أو تثمين جهود (10 درجات)"
        elif any(k in combined_text for k in ["رئيس الجامعة", "السيد رئيس الجامعة", "وكيل الوزير"]):
            issuer = "السيد رئيس الجامعة / وكيل الوزير"
            score = 8.0 if is_appreciation else 15.0
            desc = "كتاب شكر من رئيس الجامعة أو وكيل الوزير (15 درجة) أو تثمين جهود (8 درجات)"
        else:
            issuer = "السيد عميد الكلية / مساعد رئيس الجامعة"
            score = 3.0 if is_appreciation else 10.0
            desc = "كتاب شكر من عميد الكلية أو مساعد رئيس الجامعة (10 درجات) أو تثمين جهود (3 درجات)"

        doc_title = subject if ("شكر" in subject or "تثمين" in subject) else "كتاب شكر وتقدير رسمي"

        return {
            "document_type": "thank_you_letter",
            "type_arabic": "كتاب شكر وتقدير / تثمين جهود",
            "suggested_axis": "axis3",
            "suggested_paragraph": "3",
            "axis_name": "المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر",
            "paragraph_name": "كتب الشكر والتقدير أو الشهادة التقديرية خلال عام التقييم (القصوى 20 درجة)",
            "issuer": issuer,
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": doc_number or "غير محدد",
            "date": primary_date,
            "title": doc_title,
            "suggested_score": score,
            "justification": desc,
            "extracted_data": {
                "is_appreciation": is_appreciation,
                "dates": dates,
                "doc_number": doc_number,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 2. البحوث العلمية المنشورة في المجلات العالمية وتقارير الاعتمادية
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["scopus", "clarivate", "citescore", "elsevier", "springer", "ieee", "wiley", "web of science", "سكوباس", "كلاريفيت", "اعتمادية بحوث", "تقرير اعتمادية"]):
        citescore = identifiers.get("citescore")
        
        if any(k in combined_text for k in ["corresponding author", "first author", "الباحث الاول", "الباحث الأول", "المراسل"]):
            author_role = "الباحث الأول أو المراسل أو منفرد"
            base_score = 60.0
        elif any(k in combined_text for k in ["second author", "الباحث الثاني"]):
            author_role = "الباحث الثاني"
            base_score = 40.0
        else:
            author_role = "باحث مشارك"
            base_score = 30.0

        if citescore is not None and citescore < 1.0:
            suggested_score = round(base_score * (25.0 / 60.0), 1)
            citescore_desc = f"CiteScore = {citescore} (< 1) يعامل معاملة المجلات المحلية"
        else:
            suggested_score = base_score
            citescore_desc = f"CiteScore = {citescore if citescore is not None else 'معتمد'} (≥ 1)"

        return {
            "document_type": "scopus_paper",
            "type_arabic": "بحث منشور في مجلة مفهرسة ضمن مستوعبات عالمية (Scopus / Clarivate)" if "تقرير" not in combined_text else "تقرير اعتمادية بحوث ضمن المستوعبات العالمية",
            "suggested_axis": "axis2",
            "suggested_paragraph": "1",
            "axis_name": "المحور الثاني: النشاط العلمي والبحثي",
            "paragraph_name": "البحوث العلمية المنشورة في المجلات المفهرسة ضمن المستوعبات العالمية (القصوى 60 درجة)",
            "issuer": "شعبة الشؤون العلمية / لجنة الاعتمادية" if "اعتمادية" in combined_text else "مجلة عالمية مفهرسة",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": identifiers.get("doi") or doc_number or "DOI / Art. No.",
            "date": primary_date,
            "title": subject if subject and subject != "وثيقة رسمية داعمة" else "بحث علمي في مستوعب عالمي",
            "suggested_score": suggested_score,
            "justification": f"{author_role} مع {citescore_desc} -> {suggested_score} درجة",
            "extracted_data": {
                "author_role": author_role,
                "citescore": citescore,
                "doi": identifiers.get("doi"),
                "issn": identifiers.get("issn"),
                "dates": dates,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 3. الزيارات الميدانية والحقلية والأعمال التطوعية وخدمة المجتمع
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["تطوع", "تطوعي", "عمل تطوعي", "خدمة مجتمع", "خدمه مجتمع", "زيارة ميدانية", "زيارة حقلية", "حقلية", "تطوعية"]):
        score = 12.0
        desc = "الأعمال التطوعية والزيارات الميدانية وخدمة المجتمع (12 إلى 30 درجة)"
        return {
            "document_type": "field_visit_volunteering",
            "type_arabic": "وثيقة عمل تطوعي / زيارة ميدانية وخدمة المجتمع",
            "suggested_axis": "axis3",
            "suggested_paragraph": "4",
            "axis_name": "المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر",
            "paragraph_name": "الزيارات الميدانية والحقلية والأعمال التطوعية وخدمة المجتمع (القصوى 30 درجة)",
            "issuer": "الجامعة / الكلية / المؤسسة المستفيدة",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": doc_number or "كتاب تأييد",
            "date": primary_date,
            "title": subject if subject and subject != "وثيقة رسمية داعمة" else "وثيقة احتساب عمل تطوعي",
            "suggested_score": score,
            "justification": desc,
            "extracted_data": {
                "dates": dates,
                "doc_number": doc_number,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 4. التعليم المستمر وورش العمل والدورات التدريبية والتأهيل
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["تعليم مستمر", "التعليم المستمر", "ورشة عمل", "دورة تدريبية", "ندوة", "طرائق التدريس", "ضمان الجودة", "برنامج تطوير وتأهيل", "تأهيل قدرات", "حوكمة", "مهارات الإدارة"]):
        is_lecturer = any(k in combined_text for k in ["محاضر", "المدرب", "إلقاء محاضرة", "تقديم ورشة"])
        is_teaching_methods = "طرائق التدريس" in combined_text

        if is_teaching_methods:
            score = 8.0
            role = "المشاركة في دورات طرائق التدريس الحديثة"
            desc = "المشاركة في دورات طرائق التدريس الحديثة في التعليم المستمر (8 درجات)"
        elif is_lecturer:
            score = 10.0
            role = "محاضر في التعليم المستمر والجودة"
            desc = "المشاركة بصفة محاضر في التعليم المستمر والجودة (10 درجات)"
        else:
            score = 6.0
            role = "حضور في التعليم المستمر والجودة"
            desc = "المشاركة بصفة حضور في التعليم المستمر والجودة (6 درجات)"

        return {
            "document_type": "continuous_learning",
            "type_arabic": "نشاط تعليم مستمر / ضمان جودة / ورشة عمل",
            "suggested_axis": "axis3",
            "suggested_paragraph": "2",
            "axis_name": "المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر",
            "paragraph_name": "المشاركة في لجان التعليم المستمر والجودة (القصوى 20 درجة)",
            "issuer": "مركز التعليم المستمر / الكلية",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": doc_number or "شهادة / أمر",
            "date": primary_date,
            "title": subject if any(w in subject for w in ["تعليم", "ورشة", "دورة", "ندوة", "جودة", "برنامج", "تطوير"]) else role,
            "suggested_score": score,
            "justification": desc,
            "extracted_data": {
                "role": role,
                "dates": dates,
                "doc_number": doc_number,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 5. المؤتمرات العلمية والكتب المؤلفة والمترجمة والبحوث المحلية
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["مؤتمر", "مؤتمر علمي", "ietas", "conference", "كتاب مؤلف", "مؤلف", "مترجم", "isbn", "دار نشر", "بحث محلي"]):
        is_book = "كتاب" in combined_text or identifiers.get("isbn") is not None
        if is_book:
            if "عالمية" in combined_text:
                score = 20.0
                desc = "كتاب مؤلف أو مترجم منشور في دار نشر عالمية (الصنف الأول - 20 درجة)"
            elif "عربية" in combined_text or "محلية" in combined_text:
                score = 15.0
                desc = "كتاب مؤلف أو مترجم منشور في دار نشر عربية أو محلية (الصنف الثاني - 15 درجة)"
            else:
                score = 10.0
                desc = "كتاب حاصل على الرقم المعياري ISBN (الصنف الثالث - 10 درجات)"
        else:
            score = 25.0
            desc = "بحث منشور في مجلة محلية/عربية أو مشاركة في مؤتمر دولي (25 درجة)"

        return {
            "document_type": "book_or_local_paper",
            "type_arabic": "مشاركة في مؤتمر علمي / بحث محلي أو كتاب مؤلف",
            "suggested_axis": "axis2",
            "suggested_paragraph": "2",
            "axis_name": "المحور الثاني: النشاط العلمي والبحثي",
            "paragraph_name": "البحوث العلمية المنشورة والكتب المؤلفة (القصوى 25 درجة)",
            "issuer": "دار النشر / المجلة / المؤتمر",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": identifiers.get("isbn") or doc_number or "ISBN / Ref",
            "date": primary_date,
            "title": subject if subject and subject != "وثيقة رسمية داعمة" else "مؤتمر علمي أو كتاب مؤلف",
            "suggested_score": score,
            "justification": desc,
            "extracted_data": {
                "isbn": identifiers.get("isbn"),
                "dates": dates,
                "doc_number": doc_number,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 6. عضوية هيئة تحرير مجلة علمية محكمة
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["عضوية تحرير", "هيئة تحرير", "المجلة العراقية", "مجلة علمية محكمة"]):
        return {
            "document_type": "strengths_item",
            "type_arabic": "عضوية هيئة تحرير مجلة علمية محكمة (مواطن القوة)",
            "suggested_axis": "axis4",
            "suggested_paragraph": "2",
            "axis_name": "المحور الرابع: مواطن القوة",
            "paragraph_name": "عضوية هيئة تحرير مجلة علمية / نشاط متميز (القصوى 5 درجات)",
            "issuer": "المجلة العلمية / دار النشر",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": doc_number or "أمر إداري",
            "date": primary_date,
            "title": subject if subject and subject != "وثيقة رسمية داعمة" else "عضوية هيئة تحرير مجلة علمية",
            "suggested_score": 3.0,
            "justification": "عضوية هيئة تحرير مجلة علمية معتمدة تمنح 3 درجات ضمن مواطن القوة",
            "extracted_data": {
                "dates": dates,
                "doc_number": doc_number,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 7. الإشراف والتقويم العلمي ومناقشة الدراسات العليا
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["إشراف", "اشراف", "اطروحة", "أطروحة", "رسالة ماجستير", "تقويم علمي", "تقويم لغوي", "مشروع تخرج", "المشرف", "مناقشة مشاريع"]):
        if "دكتوراه" in combined_text:
            is_joint = "مشترك" in combined_text
            score = 10.0 if is_joint else 15.0
            desc = f"إشراف {'مشترك (10 درجات)' if is_joint else 'منفرد (15 درجة)'} على طلبة الدكتوراه"
        elif "ماجستير" in combined_text:
            is_joint = "مشترك" in combined_text
            score = 7.0 if is_joint else 12.0
            desc = f"إشراف {'مشترك (7 درجات)' if is_joint else 'منفرد (12 درجة)'} على طلبة الماجستير"
        elif "دبلوم عالي" in combined_text or "دبلوم" in combined_text:
            score = 9.0
            desc = "إشراف على طلبة الدبلوم العالي (9 درجات منفرد / 5 مشترك)"
        elif any(k in combined_text for k in ["تقويم علمي", "تقويم لغوي", "مقوم علمي"]):
            score = 5.0
            desc = "تقويم علمي أو لغوي لبحث أو رسالة (5 درجات)"
        else:
            score = 6.0
            desc = "إشراف على بحوث تخرج المراحل المنتهية (6 درجات)"

        return {
            "document_type": "supervision_evaluation",
            "type_arabic": "أمر إشراف على دراسات عليا / تقويم علمي",
            "suggested_axis": "axis2",
            "suggested_paragraph": "3",
            "axis_name": "المحور الثاني: النشاط العلمي والبحثي",
            "paragraph_name": "الإشراف على الطلبة والنشاطات العلمية الأخرى (القصوى 15 درجة)",
            "issuer": "الكلية / عمادة الدراسات العليا",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": doc_number or "أمر إداري",
            "date": primary_date,
            "title": subject if any(w in subject for w in ["إشراف", "اشراف", "تقويم", "ماجستير", "دكتوراه"]) else "إشراف أكاديمي / تقويم علمي",
            "suggested_score": score,
            "justification": desc,
            "extracted_data": {
                "dates": dates,
                "doc_number": doc_number,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 8. مواطن القوة الإضافية (Strengths)
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["براءة اختراع", "براءات اختراع", "h-index", "شؤون المرأة", "نقابة الأكاديميين", "حقوق الإنسان"]):
        if "براءة اختراع" in combined_text:
            score = 3.0
            title = "براءة اختراع أو جائزة علمية"
            desc = "براءات الاختراع والجوائز في عام التقييم (3 درجات)"
        elif identifiers.get("h_index") is not None:
            h = identifiers.get("h_index", 0)
            if h >= 7:
                score = 4.0
            elif h >= 4:
                score = 3.0
            elif h >= 2:
                score = 2.0
            else:
                score = 1.0
            title = f"امتلاك التدريسي لمعامل هيرش h-index = {h} في Scopus"
            desc = f"معامل هيرش h-index = {h} يمنح {score} درجات"
        elif "نقابة الأكاديميين" in combined_text:
            score = 3.0
            title = "الانتماء إلى نقابة الأكاديميين"
            desc = "الانتماء إلى نقابة الأكاديميين (3 درجات)"
        else:
            score = 3.0
            title = "أحد بنود مواطن القوة الإضافية"
            desc = "بند مواطن قوة (3 درجات)"

        return {
            "document_type": "strengths_item",
            "type_arabic": "وثيقة تابعة لمواطن القوة العلمية",
            "suggested_axis": "axis4",
            "suggested_paragraph": "1",
            "axis_name": "المحور الرابع: مواطن القوة",
            "paragraph_name": "مواطن القوة العلمية (القصوى 5 درجات مضافة)",
            "issuer": "الجهة الرسمية المانحة",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": doc_number or "رقم السجل / الوثيقة",
            "date": primary_date,
            "title": subject if subject and subject != "وثيقة رسمية داعمة" else title,
            "suggested_score": score,
            "justification": desc,
            "extracted_data": {
                "dates": dates,
                "doc_number": doc_number,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 9. الجداول والتكليفات التدريسية والمقررات (Teaching Assignments)
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["جدول", "مقرر", "مقررات", "تكليفات", "نصاب", "مهام تدريسية", "دراسات عليا", "دراسات اولية", "فصل دراسي"]):
        score = 20.0
        desc = "جدول توزيع الدروس الأسبوعي أو أمر تكليف تدريسي (20 درجة)"
        return {
            "document_type": "course_schedule",
            "type_arabic": "جدول توزيع مقررات دراسية / أمر تكليف تدريسي",
            "suggested_axis": "axis1",
            "suggested_paragraph": "1",
            "axis_name": "المحور الأول: جودة التدريس والتعليم والالتزام الوظيفي",
            "paragraph_name": "المقررات الدراسية التي تولى تدريسها ونوعها (القصوى 20 درجة)",
            "issuer": "القسم العلمي / الكلية",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": doc_number or "جدول رسمي",
            "date": primary_date,
            "title": subject if subject and subject != "وثيقة رسمية داعمة" else "جدول التكليفات والمقررات الدراسية",
            "suggested_score": score,
            "justification": desc,
            "extracted_data": {
                "dates": dates,
                "doc_number": doc_number,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 10. الأوامر الإدارية والجامعية واللجان (Committees)
    # -------------------------------------------------------------------------
    if any(k in combined_text for k in ["لجنة", "تشكيل لجنة", "امتحانية", "سمنار", "سمينار", "تقويمي", "أمر إداري", "أمر جامعي"]):
        if any(k in combined_text for k in ["امتحانية", "الامتحانية"]):
            committee_type = "اللجنة الامتحانية"
            score = 30.0
            desc = "عضو اللجنة الامتحانية (30 درجة)"
        elif any(k in combined_text for k in ["دائمية", "دائمة"]):
            committee_type = "لجنة دائمية"
            score = 20.0
            desc = "عضوية لجنة دائمية (20 درجة)"
        elif any(k in combined_text for k in ["سمنار", "سمينار"]):
            committee_type = "لجنة سمنار الدراسات العليا"
            score = 3.0
            desc = "رئاسة أو عضوية لجنة سمنار للدراسات العليا (3 درجات)"
        elif any(k in combined_text for k in ["تقويمي", "التقويمي"]):
            committee_type = "الامتحان التقويمي"
            score = 5.0
            desc = "مشارك في الامتحان التقويمي وحقق نسبة النجاح (5 درجات)"
        else:
            committee_type = "لجنة مؤقتة / تدقيقية / انضباط"
            score = 10.0
            desc = "عضوية لجنة مؤقتة (10 درجات)"

        return {
            "document_type": "committee_order",
            "type_arabic": "أمر إداري / جامعي بتشكيل لجنة",
            "suggested_axis": "axis3",
            "suggested_paragraph": "1",
            "axis_name": "المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر",
            "paragraph_name": "المشاركة في اللجان الدائمية والمؤقتة داخل وزارة التعليم العالي (القصوى 30 درجة)",
            "issuer": "الجامعة / الكلية",
            "recipient": recipient or "غير محدد",
            "subject": subject,
            "document_number": doc_number or "أمر إداري",
            "date": primary_date,
            "title": subject if (committee_type in subject) else f"أمر تشكيل {committee_type}",
            "suggested_score": score,
            "justification": desc,
            "extracted_data": {
                "committee_type": committee_type,
                "doc_number": doc_number,
                "dates": dates,
                "recipient": recipient,
                "subject": subject
            }
        }

    # -------------------------------------------------------------------------
    # 11. وثيقة عامة أو غير مصنفة
    # -------------------------------------------------------------------------
    return {
        "document_type": "general_document",
        "type_arabic": "وثيقة / مرفق رسمي",
        "suggested_axis": "axis1",
        "suggested_paragraph": "1",
        "axis_name": "المحور الأول: جودة التدريس والتعليم",
        "paragraph_name": "مرفق مؤيد لنشاط أكاديمي أو تدريسي",
        "issuer": "المؤسسة التعليمية",
        "recipient": recipient or "غير محدد",
        "subject": subject,
        "document_number": doc_number or "مرفق رسمي",
        "date": primary_date,
        "title": subject if subject and subject != "وثيقة رسمية داعمة" else (filename or "وثيقة رسمية مرفقة"),
        "suggested_score": 5.0,
        "justification": "تم استخراج النص، يرجى مراجعة وتحديد المحور والفقرة بدقة",
        "extracted_data": {
            "dates": dates,
            "doc_number": doc_number,
            "identifiers": identifiers,
            "recipient": recipient,
            "subject": subject
        }
    }


def deep_scan_and_index_document(
    text: str,
    filename: str = "",
    target_axis: Optional[str] = None,
    target_paragraph: Optional[str] = None,
    counter: int = 1,
    faculty_name: str = "أحمد لؤي أحمد",
    existing_items: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    إجراء مسح عميق بالذكاء الاصطناعي للمرفق، وفهرسته برمز رسمي،
    واستخراج الحقول التخصصية وتوليد كائن تحديث حقول الاستمارة تلقائياً
    مع كشف التكرار وصناديق التظليل البصري والربط مع سكوباس.
    """
    parsed = parse_academic_document(text, filename)
    
    # إذا حدد المستخدم المحور والفقرة مباشرة من زر الإسناد الخاص بالفقرة
    axis = target_axis or parsed["suggested_axis"]
    paragraph = str(target_paragraph or parsed["suggested_paragraph"])
    
    dates = extract_dates(text, filename)
    doc_number = extract_document_number(text, filename)
    identifiers = extract_doi_or_issn(text)
    recipient = extract_recipient(text) or parsed.get("recipient", "غير محدد")
    subject_title = parsed.get("subject") or extract_subject_or_title(text, filename, parsed.get("title", filename))
    primary_date = parsed.get("date") or (str(dates[0]) if dates else "2025/2026")
    if primary_date and dates:
        dates = [d for d in dates if str(d) == str(primary_date)] + [d for d in dates if str(d) != str(primary_date)]

    # توليد رمز الفهرسة المرجعي الموحد
    axis_clean = axis.upper().replace("AXIS", "AX")
    ref_code = f"REF-{axis_clean}-P{paragraph}-{counter:02d}"

    field_updates = {}
    auto_fill_summary = []
    score_delta = parsed["suggested_score"]

    # =========================================================================
    # استخراج وتعبئة الحقول بحسب الفقرة المستهدفة
    # =========================================================================
    if axis == "axis1":
        if paragraph == "1":
            # المقررات الدراسية
            course_name = subject_title
            level = "دراسات عليا" if any(k in text for k in ["ماجستير", "دكتوراه", "عليا"]) else "دراسات أولية"
            study_type = "عملي" if "عملي" in text and "نظري" not in text else ("نظري وعملي" if "نظري" in text and "عملي" in text else "نظري")
            semester = "فصلي (كورس أول)" if "أول" in text or "اول" in text else ("فصلي (كورس ثاني)" if "ثاني" in text else "سنوي")
            
            field_updates = {
                "action": "add_course",
                "item": {
                    "ref_code": ref_code,
                    "name": course_name,
                    "level": level,
                    "type": study_type,
                    "semester": semester,
                    "hours": 3,
                    "order_no": doc_number or "أمر تكليف",
                    "date": dates[0] if dates else "2025/2026"
                },
                "score_field": "axis1.courses_score",
                "score_value": 20.0
            }
            auto_fill_summary.append(f"تمت فهرسة مقرر '{course_name}' ({level} - {study_type}) وتحديث درجة المقررات إلى 20 درجة.")

        elif paragraph == "2":
            # استبيان الطلبة وإدارة الصف
            # البحث عن النسبة المئوية
            pct_match = re.search(r'(\d{1,3}(?:\.\d+)?)\s*%', text)
            pct = float(pct_match.group(1)) if pct_match else 85.0
            if pct >= 80.0:
                s_val = 20.0
            elif pct >= 70.0:
                s_val = 17.0
            elif pct >= 60.0:
                s_val = 14.0
            elif pct >= 50.0:
                s_val = 12.0
            else:
                s_val = 8.0

            field_updates = {
                "action": "set_score",
                "score_field": "axis1.classroom_management_score",
                "score_value": s_val,
                "percentage": pct
            }
            auto_fill_summary.append(f"تم استخراج نسبة استبيان الطلبة ({pct}%) واحتساب {s_val} درجات للفقرة.")

    elif axis == "axis2":
        if paragraph == "1":
            # بحوث المستوعبات العالمية (Clarivate / Scopus)
            citescore = identifiers.get("citescore") or 2.5
            doi = identifiers.get("doi") or doc_number or "DOI: 10.1016/..."
            author_role = parsed.get("extracted_data", {}).get("author_role", "الباحث الأول أو المراسل")
            awarded = 60.0 if citescore >= 1.0 and ("الأول" in author_role or "المراسل" in author_role or "منفرد" in author_role) else 35.0

            field_updates = {
                "action": "add_global_research",
                "item": {
                    "ref_code": ref_code,
                    "title": subject_title,
                    "journal": "مجلة مفهرسة عالمياً (Scopus/Clarivate)",
                    "citescore": citescore,
                    "author_role": author_role,
                    "doi": doi,
                    "date": dates[0] if dates else "2025/2026",
                    "score": awarded
                },
                "score_field": "axis2.global_research_score",
                "score_value": awarded
            }
            auto_fill_summary.append(f"تمت فهرسة البحث العالمي '{subject_title[:60]}' (CiteScore: {citescore}) وإسناد {awarded} درجة.")

        elif paragraph == "2":
            # بحوث محلية وكتب
            is_book = "كتاب" in text or identifiers.get("isbn") is not None
            isbn = identifiers.get("isbn") or "ISBN-..."
            awarded = 20.0 if is_book else 25.0

            field_updates = {
                "action": "add_local_research_or_book",
                "item": {
                    "ref_code": ref_code,
                    "title": subject_title,
                    "type": "كتاب علمي مؤلف/مترجم" if is_book else "بحث في مجلة محلية/مؤتمر",
                    "publisher": "دار نشر / مجلة أكاديمية",
                    "isbn_ref": isbn if is_book else doc_number or "عدد رسمي",
                    "date": dates[0] if dates else "2025/2026",
                    "score": awarded
                },
                "score_field": "axis2.local_research_score",
                "score_value": awarded
            }
            auto_fill_summary.append(f"تمت فهرسة '{subject_title[:60]}' وإسناد {awarded} درجة.")

        elif paragraph == "3":
            # إشراف وتقويم
            degree_type = "دكتوراه" if "دكتوراه" in text else ("ماجستير" if "ماجستير" in text else ("دبلوم عالي" if "دبلوم" in text else "مشروع تخرج"))
            mode = "مشترك" if "مشترك" in text else "منفرد"
            awarded = parsed["suggested_score"]

            field_updates = {
                "action": "add_supervision",
                "item": {
                    "ref_code": ref_code,
                    "title": subject_title,
                    "degree": degree_type,
                    "mode": mode,
                    "order_no": doc_number or "أمر إداري",
                    "date": dates[0] if dates else "2025/2026",
                    "score": awarded
                },
                "score_field": "axis2.supervision_score",
                "score_value": awarded
            }
            auto_fill_summary.append(f"تمت فهرسة نشاط الإشراف/التقويم ({degree_type} - {mode}) وإسناد {awarded} درجة.")

    elif axis == "axis3":
        if paragraph == "1":
            # اللجان الدائمية والمؤقتة والامتحانية
            c_type = parsed.get("extracted_data", {}).get("committee_type", "لجنة مؤقتة")
            awarded = parsed["suggested_score"]
            role = "رئيس اللجنة" if "رئيس" in text and "عضو" not in text else "عضو اللجنة"

            field_updates = {
                "action": "add_committee",
                "item": {
                    "ref_code": ref_code,
                    "name": subject_title,
                    "type": c_type,
                    "role": role,
                    "order_no": doc_number or "أمر إداري",
                    "date": dates[0] if dates else "2025/2026",
                    "score": awarded
                },
                "score_field": "axis3.committees_score",
                "score_value": awarded
            }
            auto_fill_summary.append(f"تمت فهرسة أمر تشكيل {c_type} ('{subject_title}') برقم {doc_number} وتحديث درجة اللجان.")

        elif paragraph == "2":
            # التعليم المستمر والجودة
            role = parsed.get("extracted_data", {}).get("role", "مشارك / حضور")
            awarded = parsed["suggested_score"]

            field_updates = {
                "action": "add_continuous_learning",
                "item": {
                    "ref_code": ref_code,
                    "title": subject_title,
                    "role": role,
                    "order_no": doc_number or "شهادة مشاركة",
                    "date": dates[0] if dates else "2025/2026",
                    "score": awarded
                },
                "score_field": "axis3.continuous_learning_score",
                "score_value": awarded
            }
            auto_fill_summary.append(f"تمت فهرسة نشاط التعليم المستمر '{subject_title}' بصفة ({role}) وإسناد {awarded} درجة.")

        elif paragraph == "3":
            # كتب الشكر والتقدير
            issuer = parsed.get("issuer", "العمادة / الرئاسة")
            awarded = parsed["suggested_score"]

            field_updates = {
                "action": "add_thank_you",
                "item": {
                    "ref_code": ref_code,
                    "issuer": issuer,
                    "subject": subject_title,
                    "letter_no": doc_number or "عدد رسمي",
                    "date": dates[0] if dates else "2025/2026",
                    "score": awarded
                },
                "score_field": "axis3.thank_you_score",
                "score_value": awarded
            }
            auto_fill_summary.append(f"تمت فهرسة كتاب شكر وتقدير من ({issuer}) بالعدد {doc_number} وإسناد {awarded} درجة.")

        elif paragraph == "4":
            # الزيارات الميدانية والأعمال التطوعية
            awarded = parsed["suggested_score"] or 12.0
            field_updates = {
                "action": "add_field_visit",
                "item": {
                    "ref_code": ref_code,
                    "title": subject_title,
                    "order_no": doc_number or "كتاب تأييد",
                    "date": dates[0] if dates else "2025/2026",
                    "score": awarded
                },
                "score_field": "axis3.field_visits_score",
                "score_value": awarded
            }
            auto_fill_summary.append(f"تمت فهرسة وثيقة الزيارة/العمل التطوعي '{subject_title}' وإسناد {awarded} درجة.")

    elif axis == "axis4":
        awarded = parsed["suggested_score"]
        field_updates = {
            "action": "set_strength",
            "item": {
                "ref_code": ref_code,
                "title": subject_title,
                "doc_no": doc_number or "وثيقة رسمية",
                "date": dates[0] if dates else "2025/2026",
                "score": awarded
            },
            "strength_key": f"item{paragraph}",
            "score_value": awarded
        }
        auto_fill_summary.append(f"تمت فهرسة وثيقة مواطن القوة '{subject_title}' وإضافة {awarded} درجات.")

    # فحص خط اليد
    is_hw_num = getattr(doc_number, "is_handwritten", False)
    is_hw_date = bool(dates and getattr(dates[0], "is_handwritten", False))
    hw_detected = is_hw_num or is_hw_date or parsed.get("handwritten_detected", False)
    hw_fields = []
    if is_hw_num:
        hw_fields.append("doc_number")
    if is_hw_date:
        hw_fields.append("date")
    for f in parsed.get("handwritten_fields", []):
        if f not in hw_fields:
            hw_fields.append(f)

    if hw_detected:
        hw_desc = []
        if "doc_number" in hw_fields:
            hw_desc.append(f"العدد [{doc_number}]")
        if "date" in hw_fields and dates:
            hw_desc.append(f"التاريخ [{dates[0]}]")
        note = f"✍️ تم قراءة {' و'.join(hw_desc)} بخط اليد عبر الذكاء الاصطناعي" if hw_desc else "✍️ تم التعرف على بيانات بخط اليد"
        auto_fill_summary.insert(0, note)

    # حساب صناديق التظليل البصري (Bounding Boxes) وفحص اسم التدريسي في الجداول
    from core.vlm_engine import calculate_local_bounding_boxes, extract_faculty_role_in_order
    from core.scopus_crossref import extract_doi, match_offline_journal
    
    # مطابقة اسم التدريسي في الأوامر والجداول واللجان
    matched_role_info = extract_faculty_role_in_order(text, faculty_name)
    if matched_role_info:
        # إذا كانت الوثيقة لجنة وتحدد دور التدريسي، نعدل الدرجة المستحقة فورياً
        if axis == "axis3" and str(paragraph) == "1":
            score_delta = matched_role_info["suggested_score"]
            if "score_value" in field_updates:
                field_updates["score_value"] = score_delta
            if "item" in field_updates and isinstance(field_updates["item"], dict):
                field_updates["item"]["score"] = score_delta
                field_updates["item"]["role"] = matched_role_info["role"]
        auto_fill_summary.insert(0, f"🎯 تم تمييز اسم التدريسي ({matched_role_info['matched_name']}) في قائمة/جدول الوثيقة بصفة [{matched_role_info['role']}].")

    primary_dt_str = str(dates[0]) if dates else "2025/2026"
    bboxes = calculate_local_bounding_boxes(text, str(doc_number), primary_dt_str, subject_title, matched_role_info)
    
    # فحص معرف الـ DOI ومطابقة سكوباس
    detected_doi = extract_doi(text)
    scopus_meta = match_offline_journal(subject_title) or match_offline_journal(text[:300])

    # كشف تكرار الوثائق والمرفقات السابقة
    is_duplicate = False
    duplicate_of = None
    if existing_items and doc_number and str(doc_number) not in ["غير محدد", "-", "", "None"]:
        for ex in existing_items:
            ex_dn = str(ex.get("doc_number", "")).strip()
            if ex.get("ref_code") != ref_code and ex_dn == str(doc_number).strip():
                is_duplicate = True
                duplicate_of = ex.get("ref_code")
                auto_fill_summary.append(f"⚠️ تنبيه: تم رصد هذا العدد سابقاً في الوثيقة [{duplicate_of}].")
                break

    return {
        "ref_code": ref_code,
        "axis": axis,
        "paragraph": paragraph,
        "axis_name": parsed.get("axis_name", axis),
        "paragraph_name": parsed.get("paragraph_name", f"الفقرة {paragraph}"),
        "title": subject_title,
        "subject": subject_title,
        "recipient": recipient or "غير محدد",
        "doc_type": parsed.get("type_arabic", "وثيقة رسمية"),
        "doc_number": doc_number or "غير محدد",
        "date": primary_dt_str,
        "issuer": parsed.get("issuer", "الجهة المانحة"),
        "suggested_score": score_delta,
        "raw_text_snippet": text[:350],
        "field_updates": field_updates,
        "auto_fill_summary": " | ".join(auto_fill_summary) if auto_fill_summary else "تم استخراج وفهرسة الوثيقة بنجاح.",
        "handwritten_detected": hw_detected,
        "handwritten_fields": hw_fields,
        "bounding_boxes": bboxes,
        "doi": detected_doi,
        "scopus_info": scopus_meta,
        "is_duplicate": is_duplicate,
        "duplicate_of": duplicate_of,
        "matched_faculty_info": matched_role_info
    }


