"""
منشئ استمارة تقييم أداء التدريسيين بصيغة Microsoft Word (.docx)
مطابق تماماً لاستمارة رقم (21) للعام الدراسي 2025-2026 - وزارة التعليم العالي والبحث العلمي
مع تنسيق الجداول الرسمية والخلفيات الصفراء ومحاذاة RTL وملحق الوثائق والمرفقات الثبوتية.
"""
import os
from typing import Dict, Any, List
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

from core.scoring_engine import calculate_evaluation

YELLOW_HEX = "FFF200"
GRAY_HEX = "E0E0E0"
LIGHT_YELLOW = "FFFFCC"


def set_cell_background(cell, fill_hex: str):
    """تعيين لون خلفية خلية الجدول"""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)


def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """تعيين هوامش خلية الجدول"""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''<w:tcMar {nsdecls("w")}>
        <w:top w:w="{top}" w:type="dxa"/>
        <w:bottom w:w="{bottom}" w:type="dxa"/>
        <w:left w:w="{left}" w:type="dxa"/>
        <w:right w:w="{right}" w:type="dxa"/>
    </w:tcMar>''')
    tcPr.append(tcMar)


def set_table_rtl(table):
    """جعل الجدول يدعم الاتجاه من اليمين إلى اليسار (RTL) للغة العربية"""
    tblPr = table._tbl.tblPr
    bidiVisual = parse_xml(f'<w:bidiVisual {nsdecls("w")}/>')
    tblPr.append(bidiVisual)


def set_table_borders(table, color="000000", sz="4", val="single"):
    """تعيين حدود خلايا الجدول بالكامل"""
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)


def format_paragraph(p, text="", bold=False, italic=False, size=11, align=WD_ALIGN_PARAGRAPH.RIGHT, color=None):
    """تنسيق الفقرة والخط العربي"""
    p.alignment = align
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    # تفعيل RTL للفقرة
    pPr = p._p.get_or_add_pPr()
    bidi = parse_xml(f'<w:bidi {nsdecls("w")} w:val="1"/>')
    pPr.append(bidi)
    
    if text:
        run = p.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.name = "Arial"
        run.font.size = Pt(size)
        if color:
            run.font.color.rgb = color
        # تعيين لغة الخط العربي
        rPr = run._r.get_or_add_rPr()
        rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>')
        rPr.append(rFonts)
    return p


def create_form_21_docx(data: Dict[str, Any], output_path: str, attachments: List[Dict[str, Any]] = None) -> str:
    """
    إنشاء ملف Word كامل للاستمارة 21 مع ملحق المرفقات
    """
    eval_res = calculate_evaluation(data)
    personal = data.get("personal_info", {})
    attachments = attachments or []

    doc = Document()

    # ضبط هوامش الصفحة
    for section in doc.sections:
        section.top_margin = Inches(0.5)
        section.bottom_margin = Inches(0.5)
        section.left_margin = Inches(0.5)
        section.right_margin = Inches(0.5)

    # =========================================================================
    # الصفحة الأولى : الترويسة والبيانات الرئيسة
    # =========================================================================
    header_table = doc.add_table(rows=1, cols=2)
    set_table_rtl(header_table)
    header_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    header_table.autofit = True

    # يمين: الترويسة الوزارية
    c_right = header_table.cell(0, 0)
    p_r = c_right.paragraphs[0]
    format_paragraph(p_r, "جمهورية العراق", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)
    p_r2 = c_right.add_paragraph()
    format_paragraph(p_r2, "وزارة التعليم العالي والبحث العلمي\nجهاز الإشراف والتقويم العلمي\nدائرة ضمان الجودة والاعتماد الأكاديمي\nقسم تقويم الأداء المؤسسي", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # يسار: رقم وترميز الاستمارة
    c_left = header_table.cell(0, 1)
    p_l = c_left.paragraphs[0]
    form_no = personal.get("form_no", "2025/....")
    form_code = personal.get("form_code", "AGY-....")
    format_paragraph(p_l, f"رقم الاستمارة: {form_no}\nترميز الاستمارة: {form_code}", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.LEFT)

    # عنوان الاستمارة الإطاري
    title_box = doc.add_table(rows=1, cols=1)
    set_table_rtl(title_box)
    set_table_borders(title_box, sz="8")
    c_title = title_box.cell(0, 0)
    p_t = c_title.paragraphs[0]
    format_paragraph(p_t, "استمارة رقم (21): تقييم أداء أعضاء الهيئة التدريسية للعام الدراسي 2025-2026", bold=True, size=13, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(c_title, LIGHT_YELLOW)

    p_space = doc.add_paragraph()
    p_space.paragraph_format.space_before = Pt(6)

    # الجامعة والكلية والقسم
    p_org = doc.add_paragraph()
    format_paragraph(p_org, f"البيانات الرئيسة :\nالجامعة: {personal.get('university', '......................')}    الكلية: {personal.get('college', '......................')}    القسم / الفرع: {personal.get('department', '......................')}", bold=True, size=11)

    # جدول البيانات الشخصية (مطابق للصفحة 1)
    p1_table = doc.add_table(rows=16, cols=5)
    set_table_rtl(p1_table)
    set_table_borders(p1_table)
    p1_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Row 0: الاسم الرباعي واللقب (عناوين صفراء)
    headers_r0 = ["اللقب", "اسم جد الأب", "اسم الجد", "اسم الأب", "الاسم"]
    for i, h in enumerate(headers_r0):
        c = p1_table.cell(0, i)
        set_cell_background(c, YELLOW_HEX)
        format_paragraph(c.paragraphs[0], h, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 1: قيم الاسم الرباعي
    vals_r1 = [
        personal.get("last_name", ""),
        personal.get("great_grandfather_name", ""),
        personal.get("grandfather_name", ""),
        personal.get("father_name", ""),
        personal.get("first_name", "")
    ]
    for i, v in enumerate(vals_r1):
        c = p1_table.cell(1, i)
        format_paragraph(c.paragraphs[0], v, bold=False, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 2: اسم الأم الثلاثي
    p1_table.cell(2, 0).merge(p1_table.cell(2, 1))
    p1_table.cell(2, 2).merge(p1_table.cell(2, 3))
    # الآن لدينا 3 أعمدة
    set_cell_background(p1_table.cell(2, 0), YELLOW_HEX)
    format_paragraph(p1_table.cell(2, 0).paragraphs[0], "اسم جد الأم", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(2, 2), YELLOW_HEX)
    format_paragraph(p1_table.cell(2, 2).paragraphs[0], "اسم والد الأم", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(2, 4), YELLOW_HEX)
    format_paragraph(p1_table.cell(2, 4).paragraphs[0], "اسم الأم", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 3: قيم اسم الأم
    p1_table.cell(3, 0).merge(p1_table.cell(3, 1))
    p1_table.cell(3, 2).merge(p1_table.cell(3, 3))
    format_paragraph(p1_table.cell(3, 0).paragraphs[0], personal.get("mother_grandfather_name", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(3, 2).paragraphs[0], personal.get("mother_father_name", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(3, 4).paragraphs[0], personal.get("mother_name", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 4: البطاقة الموحدة / الجنسية
    p1_table.cell(4, 2).merge(p1_table.cell(4, 4))
    set_cell_background(p1_table.cell(4, 0), YELLOW_HEX)
    format_paragraph(p1_table.cell(4, 0).paragraphs[0], "الصحيفة", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(4, 1), YELLOW_HEX)
    format_paragraph(p1_table.cell(4, 1).paragraphs[0], "السجل", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(4, 2), YELLOW_HEX)
    format_paragraph(p1_table.cell(4, 2).paragraphs[0], "رقم الجنسية أو البطاقة الموحدة", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 5: قيم الجنسية
    p1_table.cell(5, 2).merge(p1_table.cell(5, 4))
    format_paragraph(p1_table.cell(5, 0).paragraphs[0], personal.get("page_no", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(5, 1).paragraphs[0], personal.get("registry_no", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(5, 2).paragraphs[0], personal.get("national_id", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 6: تاريخ الإصدار
    p1_table.cell(6, 0).merge(p1_table.cell(6, 1))
    p1_table.cell(6, 3).merge(p1_table.cell(6, 4))
    set_cell_background(p1_table.cell(6, 0), YELLOW_HEX)
    format_paragraph(p1_table.cell(6, 0).paragraphs[0], "يوم الإصدار", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(6, 2), YELLOW_HEX)
    format_paragraph(p1_table.cell(6, 2).paragraphs[0], "شهر الإصدار", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(6, 3), YELLOW_HEX)
    format_paragraph(p1_table.cell(6, 3).paragraphs[0], "سنة الإصدار", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 7: قيم تاريخ الإصدار
    p1_table.cell(7, 0).merge(p1_table.cell(7, 1))
    p1_table.cell(7, 3).merge(p1_table.cell(7, 4))
    format_paragraph(p1_table.cell(7, 0).paragraphs[0], personal.get("issue_day", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(7, 2).paragraphs[0], personal.get("issue_month", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(7, 3).paragraphs[0], personal.get("issue_year", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 8: الشهادة والتعيين
    p1_table.cell(8, 2).merge(p1_table.cell(8, 3))
    set_cell_background(p1_table.cell(8, 0), YELLOW_HEX)
    format_paragraph(p1_table.cell(8, 0).paragraphs[0], "يوم منح الشهادة", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(8, 1), YELLOW_HEX)
    format_paragraph(p1_table.cell(8, 1).paragraphs[0], "شهر منح الشهادة", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(8, 2), YELLOW_HEX)
    format_paragraph(p1_table.cell(8, 2).paragraphs[0], "رقم وتاريخ الأمر الوزاري أو الجامعي", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(8, 4), YELLOW_HEX)
    format_paragraph(p1_table.cell(8, 4).paragraphs[0], "الشهادة", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 9: قيم الشهادة
    p1_table.cell(9, 2).merge(p1_table.cell(9, 3))
    format_paragraph(p1_table.cell(9, 0).paragraphs[0], personal.get("degree_day", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(9, 1).paragraphs[0], personal.get("degree_month", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(9, 2).paragraphs[0], personal.get("order_no_and_date", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(9, 4).paragraphs[0], personal.get("degree", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 10: جهة منح الشهادة
    p1_table.cell(10, 0).merge(p1_table.cell(10, 1))
    set_cell_background(p1_table.cell(10, 0), YELLOW_HEX)
    format_paragraph(p1_table.cell(10, 0).paragraphs[0], "القسم", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(10, 2), YELLOW_HEX)
    format_paragraph(p1_table.cell(10, 2).paragraphs[0], "الكلية", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(10, 3), YELLOW_HEX)
    format_paragraph(p1_table.cell(10, 3).paragraphs[0], "الجامعة", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(10, 4), YELLOW_HEX)
    format_paragraph(p1_table.cell(10, 4).paragraphs[0], "البلد المانح", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 11: قيم جهة منح الشهادة
    p1_table.cell(11, 0).merge(p1_table.cell(11, 1))
    format_paragraph(p1_table.cell(11, 0).paragraphs[0], personal.get("granting_dept", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(11, 2).paragraphs[0], personal.get("granting_college", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(11, 3).paragraphs[0], personal.get("granting_univ", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(11, 4).paragraphs[0], personal.get("granting_country", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 12: الاختصاص
    p1_table.cell(12, 0).merge(p1_table.cell(12, 2))
    p1_table.cell(12, 3).merge(p1_table.cell(12, 4))
    set_cell_background(p1_table.cell(12, 0), YELLOW_HEX)
    format_paragraph(p1_table.cell(12, 0).paragraphs[0], "الاختصاص الدقيق", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(12, 3), YELLOW_HEX)
    format_paragraph(p1_table.cell(12, 3).paragraphs[0], "الاختصاص العام", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 13: قيم الاختصاص
    p1_table.cell(13, 0).merge(p1_table.cell(13, 2))
    p1_table.cell(13, 3).merge(p1_table.cell(13, 4))
    format_paragraph(p1_table.cell(13, 0).paragraphs[0], personal.get("specific_specialty", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(13, 3).paragraphs[0], personal.get("general_specialty", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 14: اللقب العلمي
    set_cell_background(p1_table.cell(14, 0), YELLOW_HEX)
    format_paragraph(p1_table.cell(14, 0).paragraphs[0], "اليوم", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(14, 1), YELLOW_HEX)
    format_paragraph(p1_table.cell(14, 1).paragraphs[0], "الشهر", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(14, 2), YELLOW_HEX)
    format_paragraph(p1_table.cell(14, 2).paragraphs[0], "السنة", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(14, 3), YELLOW_HEX)
    format_paragraph(p1_table.cell(14, 3).paragraphs[0], "الجهة المانحة", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_background(p1_table.cell(14, 4), YELLOW_HEX)
    format_paragraph(p1_table.cell(14, 4).paragraphs[0], "اللقب العلمي", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # Row 15: قيم اللقب العلمي
    format_paragraph(p1_table.cell(15, 0).paragraphs[0], personal.get("title_day", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(15, 1).paragraphs[0], personal.get("title_month", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(15, 2).paragraphs[0], personal.get("title_year", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(15, 3).paragraphs[0], personal.get("title_granter", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_table.cell(15, 4).paragraphs[0], personal.get("academic_title", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # جدول الهاتف والبريد
    p1_sub_table = doc.add_table(rows=2, cols=2)
    set_table_rtl(p1_sub_table)
    set_table_borders(p1_sub_table)
    p1_sub_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_cell_background(p1_sub_table.cell(0, 0), YELLOW_HEX)
    set_cell_background(p1_sub_table.cell(0, 1), YELLOW_HEX)
    format_paragraph(p1_sub_table.cell(0, 0).paragraphs[0], "البريد الالكتروني", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_sub_table.cell(0, 1).paragraphs[0], "رقم الموبايل", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_sub_table.cell(1, 0).paragraphs[0], personal.get("email", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(p1_sub_table.cell(1, 1).paragraphs[0], personal.get("phone", ""), size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    p_note = doc.add_paragraph()
    format_paragraph(p_note, "ملاحظة: يتحمل صاحب الاستمارة مسؤولية صحة المعلومات الواردة في الاستمارة.", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.RIGHT)
    format_paragraph(doc.add_paragraph(), "5 - 1", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

    doc.add_page_break()

    # =========================================================================
    # الصفحة الثانية : المحور الأول والمحور الثاني
    # =========================================================================
    p_ax1_head = doc.add_paragraph()
    format_paragraph(p_ax1_head, "المحور الأول : جودة التدريس والتعليم والالتزام الوظيفي يملئ من قبل اللجنة العلمية بعد ان يقدم صاحب العلاقة ما يؤيد\nالفقرات ( 1 ، 3 ، 4)، تملئ الفقرتين ( 2 ، 5) من قبل المسؤول المباشر ( %50) (التدريسي غير المكلف بمهام تدريسية تحتسب له الفقرة (5) فقط وتمثل درجة المحور باكمله)", bold=True, size=10)

    ax1_table = doc.add_table(rows=7, cols=5)
    set_table_rtl(ax1_table)
    set_table_borders(ax1_table)
    ax1_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    th_ax1 = ["ت", "الفقرات", "التوصيف", "تفصيل الدرجة", "الدرجة المعطاة"]
    for i, h in enumerate(th_ax1):
        c = ax1_table.cell(0, i)
        set_cell_background(c, GRAY_HEX)
        format_paragraph(c.paragraphs[0], h, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    ax1_items = eval_res["axis1"]["items"]
    rows_ax1_data = [
        ("1", "المقررات التي قام بتدريسها", "تمنح (20) درجة لكل مقرر دراسي فصلي او سنوي (اولية او عليا) (نظري او عملي). الدرجة القصوى (20)", str(ax1_items["p1"]), f"{ax1_items['p1']}"),
        ("2", "ادارة الصف والعلاقة مع الطلبة واثارة دافعيتهم", "التقييم من خلال استمارة استبيان توزع على الطلبة (وفق الاستبانة المرفقة). الدرجة القصوى (20)", str(ax1_items["p2"]), f"{ax1_items['p2']}"),
        ("3", "التعليم المدمج", "تمنح (5) درجات لكل فقرة (استخدام طرائق متعددة، أمثلة تطبيقية، وسائل إيضاح، نشر محاضرات). الدرجة القصوى (20)", str(ax1_items["p3"]), f"{ax1_items['p3']}"),
        ("4", "وصف المقرر الدراسي وتحديثه والاساليب المستعملة", "تمنح (4) درجات لكل فقرة (وصف المقرر، مفردات المقرر، مقترحات التطوير، أساليب تقييم متنوعة، تغذية راجعة). القصوى (20)", str(ax1_items["p4"]), f"{ax1_items['p4']}"),
        ("5", "الالتزام الوظيفي", "تمنح (4) درجات لكل فقرة (20 درجة لكل فقرة للتدريسي غير المكلف). الدرجة القصوى (20) أو (100 لغير المكلف)", str(ax1_items["p5"]), f"{ax1_items['p5']}")
    ]

    for idx, (t, fq, desc, det, scr) in enumerate(rows_ax1_data, start=1):
        row = ax1_table.rows[idx]
        format_paragraph(row.cells[0].paragraphs[0], t, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[1].paragraphs[0], fq, bold=True, size=9)
        format_paragraph(row.cells[2].paragraphs[0], desc, size=8)
        format_paragraph(row.cells[3].paragraphs[0], det, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[4].paragraphs[0], scr, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # المجموع المحور 1
    total_row_ax1 = ax1_table.rows[6]
    total_row_ax1.cells[0].merge(total_row_ax1.cells[3])
    format_paragraph(total_row_ax1.cells[0].paragraphs[0], "الدرجة النهائية للمحور الأول (القصوى 100)", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(total_row_ax1.cells[4].paragraphs[0], f"{eval_res['axis1']['raw_total']}", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)

    # بداية المحور الثاني
    p_ax2_head = doc.add_paragraph()
    p_ax2_head.paragraph_format.space_before = Pt(8)
    format_paragraph(p_ax2_head, "المحور الثاني: النشاط العلمي والبحثي %30 يملئ من قبل اللجنة العلمية بعد ان تقدم الوثائق من قبل صاحب العلاقة المشمول بالتقييم", bold=True, size=10)

    ax2_table = doc.add_table(rows=5, cols=5)
    set_table_rtl(ax2_table)
    set_table_borders(ax2_table)
    ax2_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for i, h in enumerate(th_ax1):
        c = ax2_table.cell(0, i)
        set_cell_background(c, GRAY_HEX)
        format_paragraph(c.paragraphs[0], h, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    ax2_items = eval_res["axis2"]["items"]
    rows_ax2_data = [
        ("1", "البحوث العلمية المنشورة في المجلات المفهرسة ضمن المستوعبات العالمية", "تمنح (60) درجة لبحوث المستوعبات العالمية (Clarivate / Scopus) بمعامل CiteScore>=1، وتمنح (30) درجة للبحوث بمعامل CiteScore<1. الدرجة القصوى (60)", str(ax2_items["p1"]), f"{ax2_items['p1']}"),
        ("2", "البحوث العلمية المنشورة والكتب المؤلفة", "المجلات العربية والمحلية والمؤتمرات الدولية (25 درجة) والمحلية (15 درجة)، والكتب المؤلفة والمترجمة (20، 15، 10 درجات). القصوى (25)", str(ax2_items["p2"]), f"{ax2_items['p2']}"),
        ("3", "الاشراف على الطلبة والنشاطات العلمية الاخرى", "إشراف دكتوراه (15/10)، ماجستير (12/7)، دبلوم عالي (9/5)، مشاريع تخرج (6)، تقويم علمي (5). القصوى (15)", str(ax2_items["p3"]), f"{ax2_items['p3']}")
    ]

    for idx, (t, fq, desc, det, scr) in enumerate(rows_ax2_data, start=1):
        row = ax2_table.rows[idx]
        format_paragraph(row.cells[0].paragraphs[0], t, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[1].paragraphs[0], fq, bold=True, size=9)
        format_paragraph(row.cells[2].paragraphs[0], desc, size=8)
        format_paragraph(row.cells[3].paragraphs[0], det, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[4].paragraphs[0], scr, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    total_row_ax2 = ax2_table.rows[4]
    total_row_ax2.cells[0].merge(total_row_ax2.cells[3])
    format_paragraph(total_row_ax2.cells[0].paragraphs[0], "الدرجة النهائية للمحور الثاني (القصوى 100)", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(total_row_ax2.cells[4].paragraphs[0], f"{eval_res['axis2']['raw_total']}", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)

    format_paragraph(doc.add_paragraph(), "5 - 2", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    doc.add_page_break()

    # =========================================================================
    # الصفحة الثالثة : المحور الثالث (الجانب التربوي والتعليم المستمر)
    # =========================================================================
    p_ax3_head = doc.add_paragraph()
    format_paragraph(p_ax3_head, "المحور الثالث: الجانب التربوي والارشادي والتعليم المستمر 20 %", bold=True, size=11)

    ax3_table = doc.add_table(rows=6, cols=5)
    set_table_rtl(ax3_table)
    set_table_borders(ax3_table)
    ax3_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for i, h in enumerate(th_ax1):
        c = ax3_table.cell(0, i)
        set_cell_background(c, GRAY_HEX)
        format_paragraph(c.paragraphs[0], h, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    ax3_items = eval_res["axis3"]["items"]
    rows_ax3_data = [
        ("1", "المشاركة في اللجان الدائمية والمؤقته داخل وزارة التعليم العالي", "عضو لجنة امتحانية (30)، لجنة دائمية (20)، لجنة مؤقتة (10)، امتحان تقويمي (5)، لجان سمنار (3). القصوى (30) درجة", str(ax3_items["p1"]), f"{ax3_items['p1']}"),
        ("2", "المشاركة في لجان التعليم المستمر والجودة", "محاضر في التعليم المستمر (10)، حضور (6 - حضورين فقط)، دورات طرائق التدريس الحديثة (8). القصوى (20) درجة", str(ax3_items["p2"]), f"{ax3_items['p2']}"),
        ("3", "كتب الشكر والتقدير او الشهادة التقديرية خلال عام التقييم", "من الوزير (20 شكر/10 تثمين)، وكيل وزير أو رئيس جامعة (15/8)، عميد أو مساعد رئيس (10/3). القصوى (20) درجة", str(ax3_items["p3"]), f"{ax3_items['p3']}"),
        ("4", "الزيارات الميدانية والحقلية والاعمال التطوعية والمجتمعية", "زيارة ميدانية للإشراف (12)، عمل تطوعي بالوزارة/الجامعة (8)، نشاطات وخدمة مجتمع خارج الوزارة (6). القصوى (30) درجة", str(ax3_items["p4"]), f"{ax3_items['p4']}")
    ]

    for idx, (t, fq, desc, det, scr) in enumerate(rows_ax3_data, start=1):
        row = ax3_table.rows[idx]
        format_paragraph(row.cells[0].paragraphs[0], t, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[1].paragraphs[0], fq, bold=True, size=9)
        format_paragraph(row.cells[2].paragraphs[0], desc, size=8)
        format_paragraph(row.cells[3].paragraphs[0], det, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[4].paragraphs[0], scr, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    total_row_ax3 = ax3_table.rows[5]
    total_row_ax3.cells[0].merge(total_row_ax3.cells[3])
    format_paragraph(total_row_ax3.cells[0].paragraphs[0], "الدرجة النهائية للمحور الثالث (القصوى 100)", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(total_row_ax3.cells[4].paragraphs[0], f"{eval_res['axis3']['raw_total']}", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)

    format_paragraph(doc.add_paragraph(), "5 - 3", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    doc.add_page_break()

    # =========================================================================
    # الصفحة الرابعة : المحور الرابع (مواطن القوة)
    # =========================================================================
    p_ax4_head = doc.add_paragraph()
    format_paragraph(p_ax4_head, "المحور الرابع : مواطن القوة (تملى من قبل المسؤول المباشر) بعد ان تقدم الوثائق من قبل صاحب العلاقة المشمول بالتقييم\n(ملاحظة: في حال كون درجة الفقرة (المحور الثاني/1) صفر فان درجة التقييم النهائية يجب ان لا تتجاوز 75)", bold=True, size=10)

    ax4_table = doc.add_table(rows=14, cols=3)
    set_table_rtl(ax4_table)
    set_table_borders(ax4_table)
    ax4_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    th_ax4 = ["ت", "مواطن القوة العلمية", "الدرجة المعطاة"]
    for i, h in enumerate(th_ax4):
        c = ax4_table.cell(0, i)
        set_cell_background(c, GRAY_HEX)
        format_paragraph(c.paragraphs[0], h, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    user_ax4_items = data.get("axis4", {}).get("items", {})
    strengths_definitions = [
        ("1", "براءات الاختراع و الجوائز (اي جائزة تم منحها ومطابقة في بياناتها لمتطلبات النظام الالكتروني) في عام التقييم حصرا (3 درجات)", user_ax4_items.get("item1", 0)),
        ("2", "امتلاك التدريسي لمعامل هيرش index -h على صفحته في Scopus (1: درجة، 2-3: درجتان، 4-6: 3 درجات، 7 فأكثر: 4 درجات)", user_ax4_items.get("item2", 0)),
        ("3", "مسؤول وحدة شؤون المرأة وجميع العاملين معهم (3 درجات)", user_ax4_items.get("item3", 0)),
        ("4", "تطوير منظومة الكترونية لإدارة احد البرامج على مستوى الجامعة او الوزارة (3 درجات)", user_ax4_items.get("item4", 0)),
        ("5", "مسؤولي الشعب والوحدات الارشادية واعضاء الارتباط (3 درجات)", user_ax4_items.get("item5", 0)),
        ("6", "اعضاء مجالس الاعتماد البرامجي والمؤسسي والمقيم الوطني واعضاء فريق تقييم الاداء المؤسسي (4 درجات)", user_ax4_items.get("item6", 0)),
        ("7", "مدراء اقسام وشعب ضمان الجودة والاداء الجامعي وجميع العاملين فيها (5 درجات)", user_ax4_items.get("item7", 0)),
        ("8", "المدرب المعتمد في طرائق التدريس من قبل وزارة التعليم العالي والبحث العلمي مشروطة بالتغذية الراجعة والتكليف الوزاري (5 درجات)", user_ax4_items.get("item8", 0)),
        ("9", "البحوث الاضافية المنشورة في المجلات المفهرسة في المستوعبات العالمية والمحلية والتي لم يتم الاستفادة منها في التقييم (4، 3، 2، 1 درجات)", user_ax4_items.get("item9", 0)),
        ("10", "دعم نادي الطلبة بمبلغ (2000) دينار شهريا (3 درجات)", user_ax4_items.get("item10", 0)),
        ("11", "الانتماء الى نقابة الاكاديميين (3 درجات)", user_ax4_items.get("item11", 0)),
        ("12", "مسؤولي شعب و وحدات حقوق الانسان (3 درجات)", user_ax4_items.get("item12", 0))
    ]

    for idx, (t, txt, scr) in enumerate(strengths_definitions, start=1):
        row = ax4_table.rows[idx]
        format_paragraph(row.cells[0].paragraphs[0], t, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[1].paragraphs[0], txt, size=8)
        format_paragraph(row.cells[2].paragraphs[0], f"{scr}", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    total_row_ax4 = ax4_table.rows[13]
    total_row_ax4.cells[0].merge(total_row_ax4.cells[1])
    format_paragraph(total_row_ax4.cells[0].paragraphs[0], "الدرجة القصوى للمحور (5) درجات على ان لا تتجاوز درجة التقييم النهائية (100) درجة", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(total_row_ax4.cells[2].paragraphs[0], f"{eval_res['axis4']['awarded_score']}", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)

    format_paragraph(doc.add_paragraph(), "5 - 4", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    doc.add_page_break()

    # =========================================================================
    # الصفحة الخامسة : المحور الخامس والنتائج والتواقيع
    # =========================================================================
    p_ax5_head = doc.add_paragraph()
    format_paragraph(p_ax5_head, "المحور الخامس : العقوبات (خصم الدرجات ) تملى من قبل المسؤول المباشر", bold=True, size=10)

    ax5_table = doc.add_table(rows=8, cols=3)
    set_table_rtl(ax5_table)
    set_table_borders(ax5_table)
    ax5_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    th_ax5 = ["ت", "الإخفاق (تخصم الدرجة حسب الآتي)", "الدرجة التي تخصم"]
    for i, h in enumerate(th_ax5):
        c = ax5_table.cell(0, i)
        set_cell_background(c, GRAY_HEX)
        format_paragraph(c.paragraphs[0], h, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    penalties_data = [
        ("1", "لفت نظر", "تخصم (3) درجات"),
        ("2", "الإنذار", "تخصم (5) درجات"),
        ("3", "قطع الراتب", "تخصم (7) درجات"),
        ("4", "التوبيخ", "تخصم (11) درجة"),
        ("5", "إنقاص الراتب", "تخصم (13) درجة"),
        ("6", "تنزيل الدرجة", "تخصم (15) درجة")
    ]

    for idx, (t, name, ded_text) in enumerate(penalties_data, start=1):
        row = ax5_table.rows[idx]
        format_paragraph(row.cells[0].paragraphs[0], t, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[1].paragraphs[0], f"{name} ({ded_text})", size=9)
        # البحث عن الخصم في المدخلات
        format_paragraph(row.cells[2].paragraphs[0], "-", size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

    tot_pen_row = ax5_table.rows[7]
    tot_pen_row.cells[0].merge(tot_pen_row.cells[1])
    format_paragraph(tot_pen_row.cells[0].paragraphs[0], "المجموع الكلي للعقوبات المخصومة", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(tot_pen_row.cells[2].paragraphs[0], f"-{eval_res['axis5']['total_deduction']}", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)

    p_res_head = doc.add_paragraph()
    p_res_head.paragraph_format.space_before = Pt(6)
    format_paragraph(p_res_head, "النتائج النهائية للتقييم :", bold=True, size=11)

    # جدول النتائج النهائية
    res_table = doc.add_table(rows=7, cols=4)
    set_table_rtl(res_table)
    set_table_borders(res_table)
    res_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    th_res = ["ت", "المحاور", "وزن المحور", "الدرجة حسب الوزن"]
    for i, h in enumerate(th_res):
        c = res_table.cell(0, i)
        set_cell_background(c, YELLOW_HEX)
        format_paragraph(c.paragraphs[0], h, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    results_rows = [
        ("1", "جودة التدريس والتعليم والالتزام الوظيفي", "%50", f"{eval_res['axis1']['weighted_score']}"),
        ("2", "النشاط العلمي والبحثي", "%30", f"{eval_res['axis2']['weighted_score']}"),
        ("3", "الجانب التربوي والارشادي والتعليم المستمر", "%20", f"{eval_res['axis3']['weighted_score']}"),
        ("4", "مواطن القوة", "تضاف حتى 5 درجات", f"+{eval_res['axis4']['awarded_score']}"),
        ("5", "مجموع المحاور الثلاثة", "%100", f"{eval_res['three_axes_total']}"),
        ("6", "خصم درجات العقوبات", "تخصم بالكامل بدون وزن", f"-{eval_res['axis5']['total_deduction']}")
    ]

    for idx, (t, ax_name, weight, score_val) in enumerate(results_rows, start=1):
        row = res_table.rows[idx]
        format_paragraph(row.cells[0].paragraphs[0], t, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[1].paragraphs[0], ax_name, bold=True, size=9)
        format_paragraph(row.cells[2].paragraphs[0], weight, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_paragraph(row.cells[3].paragraphs[0], score_val, bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    # الدرجة النهائية رقماً وكتابة
    final_score_table = doc.add_table(rows=1, cols=2)
    set_table_rtl(final_score_table)
    set_table_borders(final_score_table, sz="8")
    final_score_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    c_s_num = final_score_table.cell(0, 0)
    c_s_txt = final_score_table.cell(0, 1)
    set_cell_background(c_s_num, LIGHT_YELLOW)
    set_cell_background(c_s_txt, LIGHT_YELLOW)

    format_paragraph(c_s_num.paragraphs[0], f"مجموع الدرجة رقماً:  {eval_res['final_score']} %", bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER)
    format_paragraph(c_s_txt.paragraphs[0], f"مجموع الدرجة كتابة:  {eval_res['score_in_words']}", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)

    # التقدير النهائي
    rating_table = doc.add_table(rows=2, cols=4)
    set_table_rtl(rating_table)
    set_table_borders(rating_table)
    rating_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    rating_headers = ["امتياز (90 فاكثر)", "جيد جدا (80 - 89)", "جيد (70 - 79)", "ضعيف (اقل من 70)"]
    for i, rh in enumerate(rating_headers):
        c = rating_table.cell(0, i)
        set_cell_background(c, GRAY_HEX)
        format_paragraph(c.paragraphs[0], rh, bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

    # تحديد علامة صح على التقدير المستحق
    r_val = eval_res["rating"]
    markers = [
        "✔ (مستحق)" if r_val == "امتياز" else "",
        "✔ (مستحق)" if r_val == "جيد جدا" else "",
        "✔ (مستحق)" if r_val == "جيد" else "",
        "✔ (مستحق)" if r_val == "ضعيف" else ""
    ]
    for i, m in enumerate(markers):
        c = rating_table.cell(1, i)
        if m:
            set_cell_background(c, YELLOW_HEX)
        format_paragraph(c.paragraphs[0], m, bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)

    # التوقيعات الرسمية
    p_sig = doc.add_paragraph()
    p_sig.paragraph_format.space_before = Pt(10)
    sig_table = doc.add_table(rows=3, cols=2)
    set_table_rtl(sig_table)
    sig_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    format_paragraph(sig_table.cell(0, 0).paragraphs[0], "التوقيع : ...................................", bold=True, size=10)
    format_paragraph(sig_table.cell(0, 1).paragraphs[0], "التوقيع : ...................................", bold=True, size=10)
    format_paragraph(sig_table.cell(1, 0).paragraphs[0], "اسم المسؤول المباشر : ......................", bold=True, size=10)
    format_paragraph(sig_table.cell(1, 1).paragraphs[0], "اسم المسؤول الأعلى : ......................", bold=True, size=10)
    format_paragraph(sig_table.cell(2, 0).paragraphs[0], "التاريخ :       /       / 2026", bold=True, size=10)
    format_paragraph(sig_table.cell(2, 1).paragraphs[0], "التاريخ :       /       / 2026", bold=True, size=10)

    p_approv = doc.add_paragraph()
    p_approv.paragraph_format.space_before = Pt(10)
    format_paragraph(p_approv, "مصادقة رئيس الجامعة\nالاسم والتوقيع والختم الرسمي: .....................................................", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)

    format_paragraph(doc.add_paragraph(), "5 - 5", bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

    p_dev_note = doc.add_paragraph()
    p_dev_note.paragraph_format.space_before = Pt(4)
    format_paragraph(p_dev_note, "ملاحظة: هذه المنصة قيد التطوير وبمبادرة شخصية من المهندس المعماري الدكتور أحمد لؤي أحمد", size=8, italic=True, align=WD_ALIGN_PARAGRAPH.CENTER)

    # =========================================================================
    # صفحة الملحق : جدول المرفقات والوثائق الثبوتية المستخرجة
    # =========================================================================
    if attachments:
        doc.add_page_break()
        p_att_title = doc.add_paragraph()
        format_paragraph(p_att_title, "ملحق رقم (1): جدول المرفقات والوثائق الثبوتية المعالجة بنظام OCR", bold=True, size=13, align=WD_ALIGN_PARAGRAPH.CENTER)
        p_att_sub = doc.add_paragraph()
        format_paragraph(p_att_sub, f"اسم التدريسي: {personal.get('first_name', '')} {personal.get('father_name', '')} {personal.get('last_name', '')}    |    الكلية: {personal.get('college', '')}    |    القسم: {personal.get('department', '')}", size=10, align=WD_ALIGN_PARAGRAPH.CENTER)

        att_table = doc.add_table(rows=len(attachments) + 1, cols=8)
        set_table_rtl(att_table)
        set_table_borders(att_table)
        att_table.alignment = WD_TABLE_ALIGNMENT.CENTER

        th_att = ["ت", "رمز الفهرسة", "نوع الوثيقة", "العدد / الإشارة", "التاريخ", "الموضوع / النشاط", "المحور والفقرة", "الدرجة"]
        for i, h in enumerate(th_att):
            c = att_table.cell(0, i)
            set_cell_background(c, YELLOW_HEX)
            format_paragraph(c.paragraphs[0], h, bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

        for idx, att in enumerate(attachments, start=1):
            row = att_table.rows[idx]
            ref_code = att.get("ref_code", f"REF-{idx:02d}")
            format_paragraph(row.cells[0].paragraphs[0], str(idx), size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
            format_paragraph(row.cells[1].paragraphs[0], ref_code, bold=True, size=8, align=WD_ALIGN_PARAGRAPH.CENTER)
            format_paragraph(row.cells[2].paragraphs[0], att.get("type_arabic", att.get("doc_type", att.get("type", "وثيقة"))), size=8)
            format_paragraph(row.cells[3].paragraphs[0], att.get("document_number", att.get("doc_number", "-")), size=8, align=WD_ALIGN_PARAGRAPH.CENTER)
            format_paragraph(row.cells[4].paragraphs[0], att.get("date", "-"), size=8, align=WD_ALIGN_PARAGRAPH.CENTER)
            format_paragraph(row.cells[5].paragraphs[0], att.get("title", att.get("filename", "")), size=8)
            format_paragraph(row.cells[6].paragraphs[0], f"{att.get('axis_name', att.get('axis', ''))} - فقرة {att.get('suggested_paragraph', att.get('paragraph', ''))}", size=8)
            format_paragraph(row.cells[7].paragraphs[0], str(att.get("suggested_score", 0)), bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

        p_att_dev = doc.add_paragraph()
        p_att_dev.paragraph_format.space_before = Pt(6)
        format_paragraph(p_att_dev, "هذه المنصة قيد التطوير وبمبادرة شخصية من المهندس المعماري الدكتور أحمد لؤي أحمد", size=8, italic=True, align=WD_ALIGN_PARAGRAPH.CENTER)

    # حفظ المستند
    doc.save(output_path)
    return output_path
