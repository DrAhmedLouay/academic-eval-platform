"""
منشئ استمارة تقييم أداء أعضاء الهيئة التدريسية بصيغة PDF
مطابق تماماً لاستمارة رقم (21) للعام الدراسي 2025-2026 - وزارة التعليم العالي والبحث العلمي
مع دعم الخطوط العربية وجداول التقييم وتفقيط الدرجة وملحق الوثائق.
"""
import os
import re
import json
import base64
import tempfile
from typing import Dict, Any, List, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Image as RLImage
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display
from pypdf import PdfReader, PdfWriter

from core.scoring_engine import calculate_evaluation

# تسجيل الخط العربي
FONT_NAME = "ArialUnicode"
FONT_PATH = "/Library/Fonts/Arial Unicode.ttf"
if not os.path.exists(FONT_PATH):
    FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

try:
    pdfmetrics.registerFont(TTFont(FONT_NAME, FONT_PATH))
except Exception as e:
    print(f"Warning: Could not register font {FONT_PATH}: {e}")
    FONT_NAME = "Helvetica"


def ar(text: Any) -> str:
    """إعادة تشكيل وعكس النص العربي ليتناسب مع محرك PDF مع الحفاظ على وسوم السطور"""
    if text is None:
        return ""
    s = str(text).strip()
    if not s:
        return ""
    # فصل السطور قبل تطبيق خوارزمية bidi حتى لا تنقلب وسوم HTML
    raw_lines = re.split(r'<br\s*/?>|\n', s)
    reshaped_lines = []
    for line in raw_lines:
        line_clean = line.strip()
        if not line_clean:
            reshaped_lines.append("")
            continue
        try:
            r = arabic_reshaper.reshape(line_clean)
            reshaped_lines.append(get_display(r))
        except Exception:
            reshaped_lines.append(line_clean)
    return "<br/>".join(reshaped_lines)


def get_ref_color_scheme(ref_code: str) -> Dict[str, str]:
    """
    استرجاع لوحة الألوان الدلالية المعتمدة لكل رمز وثيقة حسب المحور
    مع تمييز خاص وفاخر لوثائق المحور الرابع (مواطن القوة) باللون القرمزي الياقوتي
    """
    code = (ref_code or "").upper()
    if "AX4" in code:
        return {
            "name": "المحور الرابع: مواطن القوة والتميز",
            "axis_short": "المحور الرابع",
            "primary": "#9F1239",      # Deep Crimson / ياقوتي فخم
            "bg": "#FFF1F2",           # Soft Rose
            "border": "#FECDD3",
            "badge_bg": "#9F1239",
            "text": "#9F1239"
        }
    elif "AX3" in code:
        return {
            "name": "المحور الثالث: الجانب التربوي والإرشادي",
            "axis_short": "المحور الثالث",
            "primary": "#047857",      # Emerald Green
            "bg": "#ECFDF5",
            "border": "#A7F3D0",
            "badge_bg": "#047857",
            "text": "#047857"
        }
    elif "AX2" in code:
        return {
            "name": "المحور الثاني: النشاط العلمي والبحثي",
            "axis_short": "المحور الثاني",
            "primary": "#7E22CE",      # Royal Purple
            "bg": "#FAF5FF",
            "border": "#D8B4FE",
            "badge_bg": "#7E22CE",
            "text": "#7E22CE"
        }
    elif "AX1" in code:
        return {
            "name": "المحور الأول: جودة التدريس والالتزام الوظيفي",
            "axis_short": "المحور الأول",
            "primary": "#1D4ED8",      # Royal Blue
            "bg": "#EFF6FF",
            "border": "#BFDBFE",
            "badge_bg": "#1D4ED8",
            "text": "#1D4ED8"
        }
    return {
        "name": "الملف التوثيقي الرسمي المعتمد",
        "axis_short": "ملف توثيقي",
        "primary": "#334155",          # Slate
        "bg": "#F8FAFC",
        "border": "#CBD5E1",
        "badge_bg": "#334155",
        "text": "#334155"
    }


def create_dossier_page_banner_pdf(ref_code: str, title: str, width: float, height: float) -> str:
    """توليد شريط ترويسة ملون مع وسم رمز المرفق البارز في أعلى يسار الصفحة"""
    from reportlab.pdfgen import canvas
    scheme = get_ref_color_scheme(ref_code)
    t_banner = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", prefix="banner_overlay_")
    c = canvas.Canvas(t_banner.name, pagesize=(width, height))
    
    banner_h = 26.0
    y_pos = height - banner_h
    
    # 1. شريط الترويسة الأساسي
    c.setFillColor(colors.HexColor(scheme["primary"]))
    c.rect(0, y_pos, width, banner_h, fill=1, stroke=0)
    
    # 2. شارة / ختم رمز المرفق البارز في أعلى يسار الصفحة (خلفية كحلية داكنة + إطار ذهبي + نص ذهبي فاقع)
    badge_w = 145.0
    badge_h = 20.0
    badge_x = 10.0
    badge_y = y_pos + 3.0
    
    # خلفية شارة الرمز
    c.setFillColor(colors.HexColor("#0F172A"))
    c.setStrokeColor(colors.HexColor("#FACC15"))
    c.setLineWidth(1.2)
    c.roundRect(badge_x, badge_y, badge_w, badge_h, 3, fill=1, stroke=1)
    
    # كتابة رمز المرفق بلون ذهبي مميز
    c.setFillColor(colors.HexColor("#FACC15"))
    c.setFont(FONT_NAME, 8.5)
    stamp_text = ar(f"رمز المرفق: [{ref_code}]")
    c.drawCentredString(badge_x + (badge_w / 2.0), badge_y + 5.5, stamp_text)
    
    # 3. عنوان الوثيقة في الجهة اليمنى
    c.setFillColor(colors.white)
    c.setFont(FONT_NAME, 8.5)
    header_ar = ar(f"المصبار التوثيقي المعتمد | {scheme['name']} | {title[:60]}")
    c.drawRightString(width - 15, y_pos + 7.5, header_ar)
    
    c.save()
    return t_banner.name


def create_form_21_pdf(data: Dict[str, Any], output_path: str, attachments: List[Dict[str, Any]] = None) -> str:
    """
    إنشاء ملف PDF رسمي متكامل للاستمارة رقم 21 مع جدول المرفقات
    """
    eval_res = calculate_evaluation(data)
    personal = data.get("personal_info", {})
    attachments = attachments or []

    # أبعاد A4: 595.27 x 841.89 pt
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=20,
        leftMargin=20,
        topMargin=20,
        bottomMargin=20 * mm
    )

    styles = getSampleStyleSheet()
    
    # أنماط النصوص العربية
    title_style = ParagraphStyle(
        'ArabicTitle',
        fontName=FONT_NAME,
        fontSize=11,
        leading=14,
        alignment=1, # Center
        textColor=colors.black
    )
    
    h1_style = ParagraphStyle(
        'ArabicH1',
        fontName=FONT_NAME,
        fontSize=10,
        leading=13,
        alignment=2, # Right
        textColor=colors.black
    )

    cell_style = ParagraphStyle(
        'ArabicCell',
        fontName=FONT_NAME,
        fontSize=7.5,
        leading=10,
        alignment=1, # Center
        textColor=colors.black
    )

    cell_right_style = ParagraphStyle(
        'ArabicCellRight',
        fontName=FONT_NAME,
        fontSize=7,
        leading=9.5,
        alignment=2, # Right
        textColor=colors.black
    )

    header_cell_style = ParagraphStyle(
        'ArabicHeaderCell',
        fontName=FONT_NAME,
        fontSize=7.5,
        leading=10,
        alignment=1, # Center
        textColor=colors.black
    )

    story = []

    # =========================================================================
    # الصفحة 1 : البيانات الرئيسة
    # =========================================================================
    # ترويسة الصفحة
    form_no = personal.get("form_no", "2025/....")
    form_code = personal.get("form_code", "AGY-....")
    
    head_data = [
        [
            Paragraph(ar(f"رقم الاستمارة: {form_no}<br/>ترميز الاستمارة: {form_code}"), h1_style),
            Paragraph(ar("جمهورية العراق<br/>وزارة التعليم العالي والبحث العلمي<br/>جهاز الإشراف والتقويم العلمي<br/>دائرة ضمان الجودة والاعتماد الأكاديمي<br/>قسم تقويم الأداء المؤسسي"), title_style)
        ]
    ]
    t_head = Table(head_data, colWidths=[200, 355])
    t_head.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
    ]))
    story.append(t_head)
    story.append(Spacer(1, 4))

    # صندوق عنوان الاستمارة
    t_box = Table([[Paragraph(ar("استمارة رقم (21): تقييم أداء أعضاء الهيئة التدريسية للعام الدراسي 2025-2026"), title_style)]], colWidths=[555])
    t_box.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1.2, colors.black),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FFFFDD")),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4)
    ]))
    story.append(t_box)
    story.append(Spacer(1, 4))

    # التبعية الأكاديمية
    org_text = f"البيانات الرئيسة :<br/>الجامعة: {personal.get('university', '............')}    الكلية : {personal.get('college', '............')}    القسم /الفرع : {personal.get('department', '............')}"
    story.append(Paragraph(ar(org_text), h1_style))
    story.append(Spacer(1, 4))

    # جدول الصفحة 1 الرئيسي
    col_w = 555 / 5 # 111 pt لكل عمود
    p1_rows = [
        # الصف 0: الاسم الرباعي عناوين
        [Paragraph(ar(h), header_cell_style) for h in ["اللقب", "اسم جد الأب", "اسم الجد", "اسم الأب", "الاسم"]],
        # الصف 1: قيم الاسم
        [Paragraph(ar(v), cell_style) for v in [
            personal.get("last_name", ""),
            personal.get("great_grandfather_name", ""),
            personal.get("grandfather_name", ""),
            personal.get("father_name", ""),
            personal.get("first_name", "")
        ]],
        # الصف 2: اسم الأم
        [
            Paragraph(ar("اسم جد الأم"), header_cell_style), "",
            Paragraph(ar("اسم والد الأم"), header_cell_style), "",
            Paragraph(ar("اسم الأم"), header_cell_style)
        ],
        # الصف 3: قيم اسم الأم
        [
            Paragraph(ar(personal.get("mother_grandfather_name", "")), cell_style), "",
            Paragraph(ar(personal.get("mother_father_name", "")), cell_style), "",
            Paragraph(ar(personal.get("mother_name", "")), cell_style)
        ],
        # الصف 4: الجنسية
        [
            Paragraph(ar("الصحيفة"), header_cell_style),
            Paragraph(ar("السجل"), header_cell_style),
            Paragraph(ar("رقم الجنسية او البطاقة الموحدة"), header_cell_style), "", ""
        ],
        # الصف 5: قيم الجنسية
        [
            Paragraph(ar(personal.get("page_no", "")), cell_style),
            Paragraph(ar(personal.get("registry_no", "")), cell_style),
            Paragraph(ar(personal.get("national_id", "")), cell_style), "", ""
        ],
        # الصف 6: تاريخ الإصدار
        [
            Paragraph(ar("سنة الإصدار"), header_cell_style), "",
            Paragraph(ar("شهر الإصدار"), header_cell_style),
            Paragraph(ar("يوم الإصدار"), header_cell_style), ""
        ],
        # الصف 7: قيم تاريخ الإصدار
        [
            Paragraph(ar(personal.get("issue_year", "")), cell_style), "",
            Paragraph(ar(personal.get("issue_month", "")), cell_style),
            Paragraph(ar(personal.get("issue_day", "")), cell_style), ""
        ],
        # الصف 8: الشهادة
        [
            Paragraph(ar("الشهادة"), header_cell_style),
            Paragraph(ar("رقم وتاريخ الامر الوزاري او الجامعي"), header_cell_style), "",
            Paragraph(ar("شهر منح الشهادة"), header_cell_style),
            Paragraph(ar("يوم منح الشهادة"), header_cell_style)
        ],
        # الصف 9: قيم الشهادة
        [
            Paragraph(ar(personal.get("degree", "")), cell_style),
            Paragraph(ar(personal.get("order_no_and_date", "")), cell_style), "",
            Paragraph(ar(personal.get("degree_month", "")), cell_style),
            Paragraph(ar(personal.get("degree_day", "")), cell_style)
        ],
        # الصف 10: جهة منح الشهادة
        [
            Paragraph(ar("البلد المانح"), header_cell_style),
            Paragraph(ar("الجامعة"), header_cell_style),
            Paragraph(ar("الكلية"), header_cell_style),
            Paragraph(ar("القسم"), header_cell_style), ""
        ],
        # الصف 11: قيم جهة منح الشهادة
        [
            Paragraph(ar(personal.get("granting_country", "")), cell_style),
            Paragraph(ar(personal.get("granting_univ", "")), cell_style),
            Paragraph(ar(personal.get("granting_college", "")), cell_style),
            Paragraph(ar(personal.get("granting_dept", "")), cell_style), ""
        ],
        # الصف 12: الاختصاص
        [
            Paragraph(ar("الاختصاص العام"), header_cell_style), "", "",
            Paragraph(ar("الاختصاص الدقيق"), header_cell_style), ""
        ],
        # الصف 13: قيم الاختصاص
        [
            Paragraph(ar(personal.get("general_specialty", "")), cell_style), "", "",
            Paragraph(ar(personal.get("specific_specialty", "")), cell_style), ""
        ],
        # الصف 14: اللقب العلمي
        [
            Paragraph(ar("اللقب العلمي"), header_cell_style),
            Paragraph(ar("الجهة المانحة"), header_cell_style),
            Paragraph(ar("السنة"), header_cell_style),
            Paragraph(ar("شهر"), header_cell_style),
            Paragraph(ar("اليوم"), header_cell_style)
        ],
        # الصف 15: قيم اللقب العلمي
        [
            Paragraph(ar(personal.get("academic_title", "")), cell_style),
            Paragraph(ar(personal.get("title_granter", "")), cell_style),
            Paragraph(ar(personal.get("title_year", "")), cell_style),
            Paragraph(ar(personal.get("title_month", "")), cell_style),
            Paragraph(ar(personal.get("title_day", "")), cell_style)
        ],
        # الصف 16: الاتصال
        [
            Paragraph(ar("رقم الموبايل"), header_cell_style), "",
            Paragraph(ar("البريد الالكتروني"), header_cell_style), "", ""
        ],
        # الصف 17: قيم الاتصال
        [
            Paragraph(ar(personal.get("phone", "")), cell_style), "",
            Paragraph(ar(personal.get("email", "")), cell_style), "", ""
        ]
    ]

    t_p1 = Table(p1_rows, colWidths=[col_w]*5)
    t_p1.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        # تلوين العناوين بالأصفر
        ('BACKGROUND', (0, 0), (4, 0), colors.HexColor("#FFF200")),
        ('BACKGROUND', (0, 2), (4, 2), colors.HexColor("#FFF200")),
        ('BACKGROUND', (0, 4), (4, 4), colors.HexColor("#FFF200")),
        ('BACKGROUND', (0, 6), (4, 6), colors.HexColor("#FFF200")),
        ('BACKGROUND', (0, 8), (4, 8), colors.HexColor("#FFF200")),
        ('BACKGROUND', (0, 10), (4, 10), colors.HexColor("#FFF200")),
        ('BACKGROUND', (0, 12), (4, 12), colors.HexColor("#FFF200")),
        ('BACKGROUND', (0, 14), (4, 14), colors.HexColor("#FFF200")),
        ('BACKGROUND', (0, 16), (4, 16), colors.HexColor("#FFF200")),
        # الدمج
        ('SPAN', (0, 2), (1, 2)), ('SPAN', (2, 2), (3, 2)),
        ('SPAN', (0, 3), (1, 3)), ('SPAN', (2, 3), (3, 3)),
        ('SPAN', (2, 4), (4, 4)), ('SPAN', (2, 5), (4, 5)),
        ('SPAN', (0, 6), (1, 6)), ('SPAN', (3, 6), (4, 6)),
        ('SPAN', (0, 7), (1, 7)), ('SPAN', (3, 7), (4, 7)),
        ('SPAN', (1, 8), (2, 8)), ('SPAN', (1, 9), (2, 9)),
        ('SPAN', (3, 10), (4, 10)), ('SPAN', (3, 11), (4, 11)),
        ('SPAN', (0, 12), (2, 12)), ('SPAN', (3, 12), (4, 12)),
        ('SPAN', (0, 13), (2, 13)), ('SPAN', (3, 13), (4, 13)),
        ('SPAN', (0, 16), (1, 16)), ('SPAN', (2, 16), (4, 16)),
        ('SPAN', (0, 17), (1, 17)), ('SPAN', (2, 17), (4, 17)),
    ]))
    story.append(t_p1)
    story.append(Spacer(1, 4))
    story.append(Paragraph(ar("ملاحظة: يتحمل صاحب الاستمارة مسؤولية صحة المعلومات الواردة في الاستمارة."), h1_style))
    story.append(Paragraph(ar("5 - 1"), title_style))
    story.append(PageBreak())

    # =========================================================================
    # الصفحة 2 : المحور الأول والمحور الثاني
    # =========================================================================
    p2_head_txt = "المحور الأول : جودة التدريس والتعليم والالتزام الوظيفي يملئ من قبل اللجنة العلمية بعد ان يقدم صاحب العلاقة ما يؤيد الفقرات ( 1 ، 3 ، 4)، تملئ الفقرتين ( 2 ، 5) من قبل المسؤول المباشر ( %50) (التدريسي غير المكلف بمهام تدريسية تحتسب له الفقرة (5) فقط وتمثل درجة المحور باكمله)"
    story.append(Paragraph(ar(p2_head_txt), cell_right_style))
    story.append(Spacer(1, 3))

    ax1_items = eval_res["axis1"]["items"]
    # col widths: ت (20), الفقرات (100), التوصيف (315), تفصيل (60), الدرجة (60) = 555
    ax1_table_data = [
        [Paragraph(ar(x), header_cell_style) for x in ["الدرجة المعطاة", "تفصيل الدرجة", "التوصيف", "الفقرات", "ت"]],
        [
            Paragraph(ar(f"{ax1_items['p1']}"), cell_style),
            Paragraph(ar(f"{ax1_items['p1']}"), cell_style),
            Paragraph(ar("تمنح (20) درجة لكل مقرر دراسي فصلي او سنوي (اولية او عليا) (نظري او عملي). الدرجة القصوى لهذه الفقرة (20) درجة"), cell_right_style),
            Paragraph(ar("المقررات التي قام بتدريسها"), cell_right_style),
            Paragraph(ar("1"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax1_items['p2']}"), cell_style),
            Paragraph(ar(f"{ax1_items['p2']}"), cell_style),
            Paragraph(ar("التقييم من خلال استمارة استبيان توزع على الطلبة الذين يدرسهم التدريسي ولكل مقرراته. الدرجة القصوى (20)"), cell_right_style),
            Paragraph(ar("ادارة الصف والعلاقة مع الطلبة واثارة دافعيتهم"), cell_right_style),
            Paragraph(ar("2"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax1_items['p3']}"), cell_style),
            Paragraph(ar(f"{ax1_items['p3']}"), cell_style),
            Paragraph(ar("تمنح (5) درجات لكل فقرة (استخدام طرائق متعددة، أمثلة تطبيقية، وسائل إيضاح، نشر محاضرات). القصوى (20)"), cell_right_style),
            Paragraph(ar("التعليم المدمج"), cell_right_style),
            Paragraph(ar("3"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax1_items['p4']}"), cell_style),
            Paragraph(ar(f"{ax1_items['p4']}"), cell_style),
            Paragraph(ar("تمنح (4) درجات لكل فقرة (وصف المقرر، مفردات المقرر، مقترحات التطوير، أساليب تقييم متنوعة، تغذية راجعة). القصوى (20)"), cell_right_style),
            Paragraph(ar("وصف المقرر الدراسي وتحديثه والاساليب المستعملة"), cell_right_style),
            Paragraph(ar("4"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax1_items['p5']}"), cell_style),
            Paragraph(ar(f"{ax1_items['p5']}"), cell_style),
            Paragraph(ar("تمنح (4) درجات لكل فقرة (20 درجة للتدريسي غير المكلف). الدرجة القصوى (20) أو (100 لغير المكلف)"), cell_right_style),
            Paragraph(ar("الالتزام الوظيفي"), cell_right_style),
            Paragraph(ar("5"), cell_style)
        ],
        [
            Paragraph(ar(f"{eval_res['axis1']['raw_total']}"), cell_style),
            Paragraph(ar("الدرجة النهائية للمحور الأول (القصوى 100)"), header_cell_style), "", "", ""
        ]
    ]
    t_ax1 = Table(ax1_table_data, colWidths=[55, 55, 315, 105, 25])
    t_ax1.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#E0E0E0")),
        ('SPAN', (1, 6), (4, 6)),
        ('BACKGROUND', (0, 6), (-1, 6), colors.HexColor("#F0F0F0")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2)
    ]))
    story.append(t_ax1)
    story.append(Spacer(1, 4))

    # المحور الثاني
    p2_ax2_txt = "المحور الثاني: النشاط العلمي والبحثي %30 يملئ من قبل اللجنة العلمية بعد ان تقدم الوثائق من قبل صاحب العلاقة المشمول بالتقييم"
    story.append(Paragraph(ar(p2_ax2_txt), cell_right_style))
    story.append(Spacer(1, 3))

    ax2_items = eval_res["axis2"]["items"]
    ax2_table_data = [
        [Paragraph(ar(x), header_cell_style) for x in ["الدرجة المعطاة", "تفصيل الدرجة", "التوصيف", "الفقرات", "ت"]],
        [
            Paragraph(ar(f"{ax2_items['p1']}"), cell_style),
            Paragraph(ar(f"{ax2_items['p1']}"), cell_style),
            Paragraph(ar("تمنح (60) درجة لبحوث المستوعبات العالمية (Clarivate / Scopus) بمعامل استشهاد CiteScore لا يقل عن 1 (منفرد أو أول أو مراسل)، وتمنح (30) لبحوث بمعامل أقل من 1. الدرجة القصوى (60)"), cell_right_style),
            Paragraph(ar("البحوث العلمية المنشورة في المجلات المفهرسة ضمن المستوعبات العالمية"), cell_right_style),
            Paragraph(ar("1"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax2_items['p2']}"), cell_style),
            Paragraph(ar(f"{ax2_items['p2']}"), cell_style),
            Paragraph(ar("المجلات العربية والمحلية والمؤتمرات الدولية (25 درجة) والمحلية (15 درجة)، والكتب المؤلفة والمترجمة (20، 15، 10 درجات). القصوى (25)"), cell_right_style),
            Paragraph(ar("البحوث العلمية المنشورة والكتب المؤلفة"), cell_right_style),
            Paragraph(ar("2"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax2_items['p3']}"), cell_style),
            Paragraph(ar(f"{ax2_items['p3']}"), cell_style),
            Paragraph(ar("إشراف دكتوراه (15/10)، ماجستير (12/7)، دبلوم عالي (9/5)، مشاريع تخرج (6)، تقويم علمي (5). القصوى (15)"), cell_right_style),
            Paragraph(ar("الاشراف على الطلبة والنشاطات العلمية الاخرى"), cell_right_style),
            Paragraph(ar("3"), cell_style)
        ],
        [
            Paragraph(ar(f"{eval_res['axis2']['raw_total']}"), cell_style),
            Paragraph(ar("الدرجة النهائية للمحور الثاني (القصوى 100)"), header_cell_style), "", "", ""
        ]
    ]
    t_ax2 = Table(ax2_table_data, colWidths=[55, 55, 315, 105, 25])
    t_ax2.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#E0E0E0")),
        ('SPAN', (1, 4), (4, 4)),
        ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor("#F0F0F0")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2)
    ]))
    story.append(t_ax2)
    story.append(Spacer(1, 4))
    story.append(Paragraph(ar("5 - 2"), title_style))
    story.append(PageBreak())

    # =========================================================================
    # الصفحة 3 : المحور الثالث (الجانب التربوي والتعليم المستمر)
    # =========================================================================
    p3_head_txt = "المحور الثالث: الجانب التربوي والارشادي والتعليم المستمر 20 %"
    story.append(Paragraph(ar(p3_head_txt), h1_style))
    story.append(Spacer(1, 4))

    ax3_items = eval_res["axis3"]["items"]
    ax3_table_data = [
        [Paragraph(ar(x), header_cell_style) for x in ["الدرجة المعطاة", "تفصيل الدرجة", "التوصيف", "الفقرات", "ت"]],
        [
            Paragraph(ar(f"{ax3_items['p1']}"), cell_style),
            Paragraph(ar(f"{ax3_items['p1']}"), cell_style),
            Paragraph(ar("عضو لجنة امتحانية (30)، لجنة دائمية (20)، لجنة مؤقتة (10)، امتحان تقويمي (5)، لجان سمنار (3). القصوى (30) درجة"), cell_right_style),
            Paragraph(ar("المشاركة في اللجان الدائمية والمؤقته داخل وزارة التعليم العالي"), cell_right_style),
            Paragraph(ar("1"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax3_items['p2']}"), cell_style),
            Paragraph(ar(f"{ax3_items['p2']}"), cell_style),
            Paragraph(ar("محاضر في التعليم المستمر (10)، حضور (6 - حضورين فقط)، دورات طرائق التدريس الحديثة (8). القصوى (20) درجة"), cell_right_style),
            Paragraph(ar("المشاركة في لجان التعليم المستمر والجودة"), cell_right_style),
            Paragraph(ar("2"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax3_items['p3']}"), cell_style),
            Paragraph(ar(f"{ax3_items['p3']}"), cell_style),
            Paragraph(ar("من الوزير (20 شكر/10 تثمين)، وكيل وزير أو رئيس جامعة (15/8)، عميد أو مساعد رئيس (10/3). القصوى (20) درجة"), cell_right_style),
            Paragraph(ar("كتب الشكر والتقدير او الشهادة التقديرية خلال عام التقييم"), cell_right_style),
            Paragraph(ar("3"), cell_style)
        ],
        [
            Paragraph(ar(f"{ax3_items['p4']}"), cell_style),
            Paragraph(ar(f"{ax3_items['p4']}"), cell_style),
            Paragraph(ar("زيارة ميدانية للإشراف (12)، عمل تطوعي بالوزارة/الجامعة (8)، نشاطات وخدمة مجتمع خارج الوزارة (6). القصوى (30) درجة"), cell_right_style),
            Paragraph(ar("الزيارات الميدانية والحقلية والاعمال التطوعية"), cell_right_style),
            Paragraph(ar("4"), cell_style)
        ],
        [
            Paragraph(ar(f"{eval_res['axis3']['raw_total']}"), cell_style),
            Paragraph(ar("الدرجة النهائية للمحور الثالث (القصوى 100)"), header_cell_style), "", "", ""
        ]
    ]
    t_ax3 = Table(ax3_table_data, colWidths=[55, 55, 315, 105, 25])
    t_ax3.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#E0E0E0")),
        ('SPAN', (1, 5), (4, 5)),
        ('BACKGROUND', (0, 5), (-1, 5), colors.HexColor("#F0F0F0")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3)
    ]))
    story.append(t_ax3)
    story.append(Spacer(1, 4))
    story.append(Paragraph(ar("5 - 3"), title_style))
    story.append(PageBreak())

    # =========================================================================
    # الصفحة 4 : المحور الرابع (مواطن القوة)
    # =========================================================================
    p4_head_txt = "المحور الرابع : مواطن القوة (تملى من قبل المسؤول المباشر) بعد ان تقدم الوثائق من قبل صاحب العلاقة المشمول بالتقييم\n(ملاحظة: في حال كون درجة الفقرة (المحور الثاني/1) صفر فان درجة التقييم النهائية يجب ان لا تتجاوز 75)"
    story.append(Paragraph(ar(p4_head_txt), cell_right_style))
    story.append(Spacer(1, 4))

    u_ax4 = data.get("axis4", {}).get("items", {})
    strengths_pdf = [
        ("1", "براءات الاختراع و الجوائز في عام التقييم حصرا (3 درجات)", u_ax4.get("item1", 0)),
        ("2", "امتلاك التدريسي لمعامل هيرش index -h على صفحته في Scopus (4 درجات)", u_ax4.get("item2", 0)),
        ("3", "مسؤول وحدة شؤون المرأة وجميع العاملين معهم (3 درجات)", u_ax4.get("item3", 0)),
        ("4", "تطوير منظومة الكترونية لإدارة احد البرامج على مستوى الجامعة او الوزارة (3 درجات)", u_ax4.get("item4", 0)),
        ("5", "مسؤولي الشعب والوحدات الارشادية واعضاء الارتباط (3 درجات)", u_ax4.get("item5", 0)),
        ("6", "اعضاء مجالس الاعتماد البرامجي والمؤسسي والمقيم الوطني واعضاء فريق تقييم الاداء (4 درجات)", u_ax4.get("item6", 0)),
        ("7", "مدراء اقسام وشعب ضمان الجودة والاداء الجامعي وجميع العاملين فيها (5 درجات)", u_ax4.get("item7", 0)),
        ("8", "المدرب المعتمد في طرائق التدريس من قبل وزارة التعليم العالي والبحث العلمي (5 درجات)", u_ax4.get("item8", 0)),
        ("9", "البحوث الاضافية المنشورة في المجلات المفهرسة في المستوعبات العالمية والمحلية (4 درجات)", u_ax4.get("item9", 0)),
        ("10", "دعم نادي الطلبة بمبلغ (2000) دينار شهريا (3 درجات)", u_ax4.get("item10", 0)),
        ("11", "الانتماء الى نقابة الاكاديميين (3 درجات)", u_ax4.get("item11", 0)),
        ("12", "مسؤولي شعب و وحدات حقوق الانسان (3 درجات)", u_ax4.get("item12", 0))
    ]

    ax4_table_data = [
        [Paragraph(ar("الدرجة المعطاة"), header_cell_style), Paragraph(ar("مواطن القوة العلمية"), header_cell_style), Paragraph(ar("ت"), header_cell_style)]
    ]
    for t, txt, scr in strengths_pdf:
        ax4_table_data.append([
            Paragraph(ar(f"{scr}"), cell_style),
            Paragraph(ar(txt), cell_right_style),
            Paragraph(ar(t), cell_style)
        ])
    ax4_table_data.append([
        Paragraph(ar(f"{eval_res['axis4']['awarded_score']}"), cell_style),
        Paragraph(ar("الدرجة القصوى للمحور (5) درجات على ان لا تتجاوز درجة التقييم النهائية (100) درجة"), header_cell_style),
        ""
    ])

    t_ax4 = Table(ax4_table_data, colWidths=[65, 460, 30])
    t_ax4.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#E0E0E0")),
        ('SPAN', (1, 13), (2, 13)),
        ('BACKGROUND', (0, 13), (-1, 13), colors.HexColor("#F0F0F0")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2)
    ]))
    story.append(t_ax4)
    story.append(Spacer(1, 4))
    story.append(Paragraph(ar("5 - 4"), title_style))
    story.append(PageBreak())

    # =========================================================================
    # الصفحة 5 : العقوبات والنتائج النهائية والتواقيع
    # =========================================================================
    story.append(Paragraph(ar("المحور الخامس : العقوبات (خصم الدرجات) تملى من قبل المسؤول المباشر"), h1_style))
    story.append(Spacer(1, 3))

    pen_table_data = [
        [Paragraph(ar("الدرجة التي تخصم"), header_cell_style), Paragraph(ar("الإخفاق (تخصم الدرجة حسب الآتي)"), header_cell_style), Paragraph(ar("ت"), header_cell_style)],
        [Paragraph(ar("-"), cell_style), Paragraph(ar("لفت نظر (تخصم 3 درجات)"), cell_right_style), Paragraph(ar("1"), cell_style)],
        [Paragraph(ar("-"), cell_style), Paragraph(ar("الإنذار (تخصم 5 درجات)"), cell_right_style), Paragraph(ar("2"), cell_style)],
        [Paragraph(ar("-"), cell_style), Paragraph(ar("قطع الراتب (تخصم 7 درجات)"), cell_right_style), Paragraph(ar("3"), cell_style)],
        [Paragraph(ar("-"), cell_style), Paragraph(ar("التوبيخ (تخصم 11 درجة)"), cell_right_style), Paragraph(ar("4"), cell_style)],
        [Paragraph(ar("-"), cell_style), Paragraph(ar("إنقاص الراتب (تخصم 13 درجة)"), cell_right_style), Paragraph(ar("5"), cell_style)],
        [Paragraph(ar("-"), cell_style), Paragraph(ar("تنزيل الدرجة (تخصم 15 درجة)"), cell_right_style), Paragraph(ar("6"), cell_style)],
        [
            Paragraph(ar(f"-{eval_res['axis5']['total_deduction']}"), cell_style),
            Paragraph(ar("المجموع الكلي للعقوبات المخصومة"), header_cell_style),
            ""
        ]
    ]
    t_pen = Table(pen_table_data, colWidths=[90, 435, 30])
    t_pen.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#E0E0E0")),
        ('SPAN', (1, 7), (2, 7)),
        ('BACKGROUND', (0, 7), (-1, 7), colors.HexColor("#F0F0F0")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2)
    ]))
    story.append(t_pen)
    story.append(Spacer(1, 4))

    # النتائج النهائية للتقييم
    story.append(Paragraph(ar("النتائج النهائية للتقييم :"), h1_style))
    story.append(Spacer(1, 3))

    res_table_data = [
        [Paragraph(ar(x), header_cell_style) for x in ["الدرجة حسب الوزن", "الدرجة الحاصل عليها", "وزن المحور", "المحاور", "ت"]],
        [
            Paragraph(ar(f"{eval_res['axis1']['weighted_score']}"), cell_style),
            Paragraph(ar(f"{eval_res['axis1']['raw_total']}"), cell_style),
            Paragraph(ar("%50"), cell_style),
            Paragraph(ar("جودة التدريس والتعليم والالتزام الوظيفي"), cell_right_style),
            Paragraph(ar("1"), cell_style)
        ],
        [
            Paragraph(ar(f"{eval_res['axis2']['weighted_score']}"), cell_style),
            Paragraph(ar(f"{eval_res['axis2']['raw_total']}"), cell_style),
            Paragraph(ar("%30"), cell_style),
            Paragraph(ar("النشاط العلمي والبحثي"), cell_right_style),
            Paragraph(ar("2"), cell_style)
        ],
        [
            Paragraph(ar(f"{eval_res['axis3']['weighted_score']}"), cell_style),
            Paragraph(ar(f"{eval_res['axis3']['raw_total']}"), cell_style),
            Paragraph(ar("%20"), cell_style),
            Paragraph(ar("الجانب التربوي والارشادي والتعليم المستمر"), cell_right_style),
            Paragraph(ar("3"), cell_style)
        ],
        [
            Paragraph(ar(f"+{eval_res['axis4']['awarded_score']}"), cell_style),
            Paragraph(ar(f"{eval_res['axis4']['raw_score']}"), cell_style),
            Paragraph(ar("حتى 5 درجات"), cell_style),
            Paragraph(ar("مواطن القوة"), cell_right_style),
            Paragraph(ar("4"), cell_style)
        ],
        [
            Paragraph(ar(f"{eval_res['three_axes_total']}"), cell_style),
            Paragraph(ar("-"), cell_style),
            Paragraph(ar("%100"), cell_style),
            Paragraph(ar("مجموع المحاور الثلاثة"), cell_right_style),
            Paragraph(ar("5"), cell_style)
        ],
        [
            Paragraph(ar(f"-{eval_res['axis5']['total_deduction']}"), cell_style),
            Paragraph(ar("-"), cell_style),
            Paragraph(ar("تخصم بالكامل"), cell_style),
            Paragraph(ar("خصم درجات العقوبات"), cell_right_style),
            Paragraph(ar("6"), cell_style)
        ]
    ]
    t_res = Table(res_table_data, colWidths=[80, 80, 75, 290, 30])
    t_res.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#FFF200")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2)
    ]))
    story.append(t_res)
    story.append(Spacer(1, 4))

    # المجموع رقماً وكتابة
    final_box_data = [
        [
            Paragraph(ar(f"مجموع الدرجة كتابة: {eval_res['score_in_words']}"), h1_style),
            Paragraph(ar(f"مجموع الدرجة رقماً: {eval_res['final_score']} %"), h1_style)
        ]
    ]
    t_fin = Table(final_box_data, colWidths=[355, 200])
    t_fin.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FFFFDD")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3)
    ]))
    story.append(t_fin)
    story.append(Spacer(1, 4))

    # التقدير النهائي
    r_val = eval_res["rating"]
    rat_data = [
        [Paragraph(ar(x), header_cell_style) for x in ["ضعيف (اقل من 70)", "جيد (70 - 79)", "جيد جدا (80 - 89)", "امتياز (90 فاكثر)"]],
        [
            Paragraph(ar("✔ (مستحق)" if r_val == "ضعيف" else ""), cell_style),
            Paragraph(ar("✔ (مستحق)" if r_val == "جيد" else ""), cell_style),
            Paragraph(ar("✔ (مستحق)" if r_val == "جيد جدا" else ""), cell_style),
            Paragraph(ar("✔ (مستحق)" if r_val == "امتياز" else ""), cell_style)
        ]
    ]
    t_rat = Table(rat_data, colWidths=[555/4]*4)
    t_rat.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#E0E0E0")),
        ('BACKGROUND', (3 if r_val=="امتياز" else 2 if r_val=="جيد جدا" else 1 if r_val=="جيد" else 0, 1), 
                       (3 if r_val=="امتياز" else 2 if r_val=="جيد جدا" else 1 if r_val=="جيد" else 0, 1), colors.HexColor("#FFF200")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3)
    ]))
    story.append(t_rat)
    story.append(Spacer(1, 8))

    # التواقيع الرسمية
    sigs = data.get("signatures", {}) if isinstance(data, dict) else {}
    dm_sig_img = None
    hm_sig_img = None
    stamp_img = None
    temp_sig_files = []

    def save_temp_sig(b64_str, prefix="sig_"):
        if not b64_str:
            return None
        try:
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]
            data_bytes = base64.b64decode(b64_str)
            tf = tempfile.NamedTemporaryFile(delete=False, suffix=".png", prefix=prefix)
            tf.write(data_bytes)
            tf.close()
            temp_sig_files.append(tf.name)
            return tf.name
        except Exception:
            return None

    if sigs.get("direct_manager_sig"):
        dm_path = save_temp_sig(sigs["direct_manager_sig"], "dm_sig_")
        if dm_path and os.path.exists(dm_path):
            dm_sig_img = RLImage(dm_path, width=90, height=35)
            
    if sigs.get("higher_manager_sig"):
        hm_path = save_temp_sig(sigs["higher_manager_sig"], "hm_sig_")
        if hm_path and os.path.exists(hm_path):
            hm_sig_img = RLImage(hm_path, width=90, height=35)

    if sigs.get("college_stamp"):
        st_path = save_temp_sig(sigs["college_stamp"], "stamp_")
        if st_path and os.path.exists(st_path):
            stamp_img = RLImage(st_path, width=50, height=50)

    sig_row1 = [
        Paragraph(ar("التوقيع : ..................................."), cell_right_style),
        Paragraph(ar("التوقيع : ..................................."), cell_right_style)
    ]
    if dm_sig_img or hm_sig_img:
        sig_row1 = [
            dm_sig_img if dm_sig_img else Paragraph(ar("التوقيع : ..................................."), cell_right_style),
            hm_sig_img if hm_sig_img else Paragraph(ar("التوقيع : ..................................."), cell_right_style)
        ]

    sig_data = [
        sig_row1,
        [Paragraph(ar(f"اسم المسؤول المباشر : {sigs.get('direct_manager_name', '......................')}"), cell_right_style), 
         Paragraph(ar(f"اسم المسؤول الأعلى : {sigs.get('higher_manager_name', '......................')}"), cell_right_style)],
        [Paragraph(ar(f"التاريخ : {sigs.get('direct_manager_date', '      /       / 2026')}"), cell_right_style), 
         Paragraph(ar(f"التاريخ : {sigs.get('higher_manager_date', '      /       / 2026')}"), cell_right_style)]
    ]
    t_sig = Table(sig_data, colWidths=[277, 278])
    t_sig.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
    story.append(t_sig)
    story.append(Spacer(1, 4))
    
    pres_p = Paragraph(ar("مصادقة رئيس الجامعة<br/>الاسم والتوقيع والختم الرسمي: ....................................................."), title_style)
    if stamp_img:
        t_pres = Table([[pres_p, stamp_img]], colWidths=[455, 100])
        t_pres.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
        story.append(t_pres)
    else:
        story.append(pres_p)

    story.append(Paragraph(ar("5 - 5"), title_style))
    
    dev_note_style = ParagraphStyle(
        'ArabicDevNote',
        fontName=FONT_NAME,
        fontSize=7,
        leading=9,
        alignment=1, # Center
        textColor=colors.HexColor("#475569")
    )
    story.append(Spacer(1, 3))
    story.append(Paragraph(ar("ملاحظة: هذه المنصة قيد التطوير وبمبادرة شخصية من المهندس المعماري الدكتور أحمد لؤي أحمد"), dev_note_style))

    # =========================================================================
    # الصفحة 6 (الملحق) : جدول المرفقات
    # =========================================================================
    if attachments:
        story.append(PageBreak())
        story.append(Paragraph(ar("ملحق رقم (1): جدول المرفقات والوثائق الثبوتية المعالجة بنظام OCR"), title_style))
        story.append(Spacer(1, 4))

        att_data = [
            [Paragraph(ar(x), header_cell_style) for x in ["الدرجة", "المحور والفقرة", "الموضوع / العنوان", "التاريخ", "العدد", "نوع الوثيقة", "رمز الفهرسة", "ت"]]
        ]
        t_att_styles = [
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#FFF200")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3)
        ]
        for idx, att in enumerate(attachments, start=1):
            ref_code = att.get("ref_code", f"REF-{idx:02d}")
            scheme = get_ref_color_scheme(ref_code)
            styled_ref = f"<font color='{scheme['primary']}'><b>{ref_code}</b></font>"
            t_att_styles.append(('BACKGROUND', (6, idx), (6, idx), colors.HexColor(scheme["bg"])))
            t_att_styles.append(('BOX', (6, idx), (6, idx), 1.0, colors.HexColor(scheme["border"])))
            
            att_data.append([
                Paragraph(ar(f"{att.get('suggested_score', 0)}"), cell_style),
                Paragraph(ar(f"{att.get('axis_name', att.get('axis', ''))} - فقرة {att.get('suggested_paragraph', att.get('paragraph', ''))}"), cell_right_style),
                Paragraph(ar(att.get("title", att.get("filename", ""))), cell_right_style),
                Paragraph(ar(att.get("date", "-")), cell_style),
                Paragraph(ar(att.get("document_number", att.get("doc_number", "-"))), cell_style),
                Paragraph(ar(att.get("type_arabic", att.get("doc_type", att.get("type", "وثيقة")))), cell_right_style),
                Paragraph(styled_ref, cell_style),
                Paragraph(ar(f"{idx}"), cell_style)
            ])
        t_att = Table(att_data, colWidths=[35, 95, 135, 55, 65, 80, 65, 25])
        t_att.setStyle(TableStyle(t_att_styles))
        story.append(t_att)
        story.append(Spacer(1, 6))
        story.append(Paragraph(ar("هذه المنصة قيد التطوير وبمبادرة شخصية من المهندس المعماري الدكتور أحمد لؤي أحمد"), dev_note_style))

    doc.build(story)

    # تنظيف الملفات المؤقتة للتواقيع
    for tf_name in temp_sig_files:
        try:
            if os.path.exists(tf_name):
                os.remove(tf_name)
        except Exception:
            pass

    return output_path


def convert_image_to_a4_pdf(image_path: str, output_pdf_path: str, ref_code: str = "", title: str = "") -> str:
    """تحويل صورة الوثيقة الثبوتية إلى صفحة PDF بحجم A4 بهوامش 20 ملم (2 سم) من الأعلى والأسفل و 15 ملم (1.5 سم) من الجانبين"""
    doc = SimpleDocTemplate(
        output_pdf_path,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm
    )
    story = []
    
    scheme = get_ref_color_scheme(ref_code)
    
    # بناء شريط ترويسة رسمي ملون مع وسم رمز المرفق البارز في أقصى اليسار العلوي
    hdr_table_data = [
        [
            Paragraph(f"<font color='#FACC15'><b>&nbsp;رمز المرفق: [{ref_code}]&nbsp;</b></font>", ParagraphStyle('HdrRef', fontName=FONT_NAME, fontSize=9.5, leading=12, alignment=1)),
            Paragraph(ar(f"<font color='#FFFFFF'><b>المصبار التوثيقي المعتمد | {scheme['name']} | {title[:65]}</b></font>"), ParagraphStyle('HdrTitle', fontName=FONT_NAME, fontSize=8.5, leading=11, alignment=2))
        ]
    ]
    t_hdr = Table(hdr_table_data, colWidths=[140, 370])
    t_hdr.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor("#0F172A")),  # خلفية كحلية داكنة مميزة للرمز في أعلى اليسار
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor(scheme["primary"])),
        ('BOX', (0, 0), (0, 0), 1.5, colors.HexColor("#FACC15")),   # إطار ذهبي بارز لرمز المرفق
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_hdr)
    story.append(Spacer(1, 6))
    
    try:
        # حساب أبعاد الصورة لتلائم صفحة A4 بهوامش 2 سم أعلى وأسفل و 1.5 سم جانبين (عرض 510 × ارتفاع 680 كحد أقصى)
        from PIL import Image as PILImage
        with PILImage.open(image_path) as im:
            w, h = im.size
        
        max_w, max_h = 510.0, 650.0
        ratio = min(max_w / w, max_h / h)
        disp_w = w * ratio
        disp_h = h * ratio
        
        story.append(RLImage(image_path, width=disp_w, height=disp_h))
    except Exception as e:
        story.append(Paragraph(ar(f"تعذر تحميل صورة الوثيقة: {e}"), ParagraphStyle('DocErr', fontName=FONT_NAME, fontSize=9, textColor=colors.red)))
        
    doc.build(story)
    return output_pdf_path


def create_consolidated_dossier_pdf(
    data: Dict[str, Any],
    output_path: str,
    attachments: List[Dict[str, Any]] = None,
    uploads_base_dir: str = ""
) -> str:
    """
    إنشاء المصبار التوثيقي المدمج فائق الدقة (Consolidated Portfolio PDF)
    يدمج صفحات استمارة (21) مع كافة الوثائق والمرفقات الأصلية في ملف PDF واحد متكامل
    مع روابط تشعبية وفهارس تفاعلية (Interactive Bookmarks / Outlines)
    """
    # 1. إنشاء استمارة (21) في ملف مؤقت
    temp_form = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", prefix="form21_base_")
    temp_form.close()
    
    create_form_21_pdf(data, temp_form.name, attachments=attachments)
    
    writer = PdfWriter()
    temp_files_to_clean = [temp_form.name]
    
    # 2. قراءة وإضافة صفحات استمارة (21)
    form_reader = PdfReader(temp_form.name)
    form_page_count = len(form_reader.pages)
    
    for page in form_reader.pages:
        writer.add_page(page)
        
    # إضافة علامات مرجعية (Bookmarks) للاستمارة
    writer.add_outline_item("استمارة رقم (21) - التقييم السنوي", 0)
    if form_page_count > 5:
        writer.add_outline_item("ملحق رقم (1): جدول المرفقات المفهرسة", 5)

    # 3. دمج المرفقات الثبوتية وتوليد علامات مرجعية لكل وثيقة
    if attachments:
        parent_outline = writer.add_outline_item("الملف التوثيقي المعتمد (الوثائق الأصلية)", form_page_count)
        current_page_idx = form_page_count
        
        for idx, att in enumerate(attachments, start=1):
            ref_code = att.get("ref_code", f"REF-{idx:02d}")
            title = att.get("title") or att.get("filename") or f"وثيقة {idx}"
            file_p = att.get("file_path", "")
            
            # تحديد المسار الفعلي للملف على القرص
            real_path = ""
            if file_p.startswith("/uploads/"):
                sub_path = file_p.replace("/uploads/", "", 1)
                cand1 = os.path.join(uploads_base_dir, sub_path)
                if os.path.exists(cand1):
                    real_path = cand1
            elif os.path.exists(file_p):
                real_path = file_p

            # إذا لم يتم العثور على الملف في المسار الأساسي، البحث في مجلد uploads أو uploads_backup
            if not real_path and uploads_base_dir:
                for d in [uploads_base_dir, os.path.join(os.path.dirname(uploads_base_dir), "uploads_backup")]:
                    if os.path.exists(d):
                        for f in os.listdir(d):
                            if att.get("filename") and att["filename"] in f:
                                real_path = os.path.join(d, f)
                                break
                    if real_path:
                        break

            if real_path and os.path.exists(real_path):
                ext = os.path.splitext(real_path)[1].lower()
                doc_pdf_path = ""
                
                if ext == ".pdf":
                    doc_pdf_path = real_path
                elif ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
                    t_img_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", prefix=f"att_{idx}_")
                    t_img_pdf.close()
                    convert_image_to_a4_pdf(real_path, t_img_pdf.name, ref_code, title)
                    doc_pdf_path = t_img_pdf.name
                    temp_files_to_clean.append(t_img_pdf.name)
                
                if doc_pdf_path and os.path.exists(doc_pdf_path):
                    try:
                        att_reader = PdfReader(doc_pdf_path)
                        writer.add_outline_item(f"[{ref_code}] {title[:40]}", current_page_idx, parent=parent_outline)
                        for att_page in att_reader.pages:
                            # تطبيق الترويسة الملونة الرسمية للوثائق ذات الامتداد PDF
                            if ext == ".pdf":
                                try:
                                    pw = float(att_page.mediabox.width)
                                    ph = float(att_page.mediabox.height)
                                    b_path = create_dossier_page_banner_pdf(ref_code, title, pw, ph)
                                    b_reader = PdfReader(b_path)
                                    att_page.merge_page(b_reader.pages[0])
                                    if os.path.exists(b_path):
                                        os.remove(b_path)
                                except Exception as b_err:
                                    print(f"Notice: banner overlay skipped for {ref_code}: {b_err}")
                            writer.add_page(att_page)
                            current_page_idx += 1
                    except Exception as merge_err:
                        print(f"Error merging attachment {ref_code}: {merge_err}")

    # 4. حفظ ملف المصبار التوثيقي المتكامل
    with open(output_path, "wb") as f_out:
        writer.write(f_out)
        
    # تنظيف الملفات المؤقتة
    for tf in temp_files_to_clean:
        try:
            if os.path.exists(tf):
                os.remove(tf)
        except Exception:
            pass

    return output_path

