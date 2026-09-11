"""
تطبيق الويب الرئيسي لمنصة استمارة تقييم أداء أعضاء الهيئة التدريسية (استمارة 21)
وزارة التعليم العالي والبحث العلمي - 2025-2026
مع محرك معالجة المرفقات بـ OCR وتصدير ملفات Word و PDF
"""
import os
import re
import uuid
import shutil
import json
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.ocr_engine import process_document
from core.document_parser import parse_academic_document, deep_scan_and_index_document
from core.scoring_engine import calculate_evaluation
from core.docx_generator import create_form_21_docx
from core.pdf_generator import create_form_21_pdf

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
EXPORTS_DIR = os.path.join(BASE_DIR, "exports")
STATIC_DIR = os.path.join(BASE_DIR, "static")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

app = FastAPI(
    title="منصة تقييم أداء الهيئة التدريسية - استمارة 21",
    description="منصة تفاعلية ذكية لملء ومعالجة استمارة تقييم الأداء السنوي مع قارئ OCR وتصدير Word و PDF",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EvaluationRequest(BaseModel):
    form_data: Dict[str, Any]
    attachments: List[Dict[str, Any]] = []


@app.post("/api/upload-and-ocr")
async def upload_and_ocr(file: UploadFile = File(...)):
    """
    استقبال المرفقات (PDF أو صور)، استخراج النصوص بـ OCR والتحليل الذكي للبيانات
    """
    try:
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".txt"]:
            raise HTTPException(status_code=400, detail="نوع الملف غير مدعوم. يرجى رفع ملف بصيغة PDF أو صورة JPG/PNG.")

        # حفظ الملف في مجلد uploads
        file_id = str(uuid.uuid4())
        safe_filename = f"{file_id}_{file.filename}"
        saved_path = os.path.join(UPLOADS_DIR, safe_filename)

        with open(saved_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # استخراج النص عبر محرك OCR و PDF
        ocr_result = process_document(saved_path)
        extracted_text = ocr_result.get("text", "")

        # تحليل وتصنيف الوثيقة بالذكاء الاصطناعي
        parsed_doc = parse_academic_document(extracted_text, filename=file.filename)

        return JSONResponse({
            "success": True,
            "file_id": file_id,
            "filename": file.filename,
            "file_path": f"/uploads/{safe_filename}",
            "ocr_result": ocr_result,
            "parsed_document": parsed_doc
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/scan-evidence")
async def scan_evidence(
    file: UploadFile = File(...),
    target_axis: Optional[str] = Form(None),
    target_paragraph: Optional[str] = Form(None),
    counter: int = Form(1),
    faculty_name: str = Form("أحمد لؤي أحمد")
):
    """
    مسح المرفق بالذكاء الاصطناعي وقراءته وفهرسته كدليل مسند لفقرة محددة، واستخراج بياناتها وملء حقولها
    """
    try:
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".txt"]:
            raise HTTPException(status_code=400, detail="نوع الملف غير مدعوم. يرجى رفع ملف بصيغة PDF أو صورة JPG/PNG.")

        file_id = str(uuid.uuid4())
        safe_filename = f"{file_id}_{file.filename}"
        saved_path = os.path.join(UPLOADS_DIR, safe_filename)

        with open(saved_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        ocr_result = process_document(saved_path)
        extracted_text = ocr_result.get("text", "")

        indexed_item = deep_scan_and_index_document(
            text=extracted_text,
            filename=file.filename,
            target_axis=target_axis if target_axis and target_axis != "auto" else None,
            target_paragraph=target_paragraph if target_paragraph and target_paragraph != "auto" else None,
            counter=counter,
            faculty_name=faculty_name
        )

        indexed_item["file_id"] = file_id
        indexed_item["filename"] = file.filename
        indexed_item["file_path"] = f"/uploads/{safe_filename}"
        indexed_item["ocr_success"] = ocr_result.get("has_text", False)

        return JSONResponse({
            "success": True,
            "indexed_evidence": indexed_item,
            "field_updates": indexed_item["field_updates"],
            "auto_fill_summary": indexed_item["auto_fill_summary"]
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/batch-scan-evidence")
async def batch_scan_evidence(
    files: List[UploadFile] = File(...),
    faculty_name: str = Form("أحمد لؤي أحمد")
):
    """
    المسح الشامل المجمع لملفات متعددة وفهرستها بالذكاء الاصطناعي وتوزيعها آلياً على فقرات الاستمارة
    """
    try:
        results = []
        for idx, file in enumerate(files, start=1):
            file_ext = os.path.splitext(file.filename)[1].lower()
            if file_ext not in [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".txt"]:
                continue

            file_id = str(uuid.uuid4())
            safe_filename = f"{file_id}_{file.filename}"
            saved_path = os.path.join(UPLOADS_DIR, safe_filename)

            with open(saved_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            ocr_res = process_document(saved_path)
            extracted_text = ocr_res.get("text", "")

            indexed_item = deep_scan_and_index_document(
                text=extracted_text,
                filename=file.filename,
                target_axis=None,
                target_paragraph=None,
                counter=idx,
                faculty_name=faculty_name
            )
            indexed_item["file_id"] = file_id
            indexed_item["filename"] = file.filename
            indexed_item["file_path"] = f"/uploads/{safe_filename}"
            indexed_item["ocr_success"] = ocr_res.get("has_text", False)
            results.append(indexed_item)

        return JSONResponse({
            "success": True,
            "count": len(results),
            "indexed_evidence_list": results
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/reprocess-all-attachments")
async def reprocess_all_attachments(faculty_name: Optional[str] = Form(None)):
    """
    إعادة مسح ومعالجة وفهرسة كافة المرفقات بالذكاء الاصطناعي الأكثر حرية ومرونة
    مع استخراج (إلى / الجهة المعنون إليها) و (م / موضوع الوثيقة) وقراءة خط اليد للأعداد والتواريخ
    وتمييز اسم التدريسي في الجداول والأوامر الإدارية.
    """
    try:
        if not os.path.exists(UPLOADS_DIR):
            return JSONResponse({"success": True, "count": 0, "indexed_evidence_list": []})

        files = sorted(os.listdir(UPLOADS_DIR))
        results = []
        seen_orig_names = set()
        counter = 1
        target_faculty = faculty_name or "أحمد لؤي أحمد"

        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".txt"]:
                continue
            
            orig_filename = re.sub(r'^[0-9a-f\-]{36}_', '', fn)
            # استبعاد الملفات النصية أو التكرارات
            if orig_filename.startswith("test_") or orig_filename.endswith(".txt") or orig_filename in seen_orig_names:
                continue

            seen_orig_names.add(orig_filename)
            file_path = os.path.join(UPLOADS_DIR, fn)
            try:
                ocr_res = process_document(file_path)
                txt = ocr_res.get("text", "")
                
                indexed_item = deep_scan_and_index_document(
                    text=txt,
                    filename=orig_filename,
                    target_axis=None,
                    target_paragraph=None,
                    counter=counter,
                    faculty_name=target_faculty
                )
                indexed_item["file_id"] = fn.split("_")[0] if "_" in fn else fn
                indexed_item["filename"] = orig_filename
                indexed_item["file_path"] = f"/uploads/{fn}"
                indexed_item["ocr_success"] = ocr_res.get("has_text", False)
                results.append(indexed_item)
                counter += 1
            except Exception as item_err:
                print(f"Error processing {fn}: {item_err}")

        # حفظ النتائج في كاش الفهرس الدائم
        try:
            cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
            with open(cache_file, "w", encoding="utf-8") as cf:
                json.dump({"success": True, "count": len(results), "indexed_evidence_list": results}, cf, ensure_ascii=False, indent=2)
        except Exception as e_cache:
            print(f"Error caching indexed results: {e_cache}")

        return JSONResponse({
            "success": True,
            "count": len(results),
            "indexed_evidence_list": results
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/evidence-catalog")
async def get_evidence_catalog():
    """
    استرجاع الفهرس الشامل المحدث للأدلة والمرفقات المقروءة بالذكاء الاصطناعي
    """
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as cf:
                data = json.load(cf)
                return JSONResponse(data if isinstance(data, dict) else {"success": True, "count": len(items), "indexed_evidence_list": items})
        except Exception:
            pass

    static_catalog = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "data", "evidence_catalog.json")
    if os.path.exists(static_catalog):
        try:
            with open(static_catalog, "r", encoding="utf-8") as scf:
                sdata = json.load(scf)
                return JSONResponse(sdata)
        except Exception:
            pass

    return await reprocess_all_attachments()


@app.post("/api/clear-stuck-evidence")
async def clear_stuck_evidence():
    """
    تفريغ فهرس الأدلة من الملفات العالقة وغير المكتملة والمكررة والمجهولة
    مع الإبقاء على كافة الوثائق والكتب الرسمية المعتمدة المؤكدة بالذكاء الاصطناعي
    """
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
    if not os.path.exists(cache_file):
        return JSONResponse({"success": True, "count": 0, "indexed_evidence_list": []})

    try:
        with open(cache_file, "r", encoding="utf-8") as cf:
            data = json.load(cf)

        current_items = data.get("indexed_evidence_list", [])
        clean_items = []
        seen_doc_numbers = set()

        for item in current_items:
            fn = item.get("filename", "")
            dn = str(item.get("doc_number", "")).strip()

            # استبعاد الملفات العالقة التي لم يتم استخراج عدد رسمي لها أو الصور المؤقتة والمكررة
            is_unidentified = dn in ["غير محدد", "-", "", "None", "وثيقة رسمية", "مرفق رسمي"]
            is_temp_duplicate = "tempImageRFUEfQ" in fn or "Screenshot 2025-10-20 at 18.08.43" in fn
            is_garbage = any(k in fn for k in ["PHOTO-2025-04", "PHOTO-2024-11-12", "PHOTO-2024-11-05"]) and is_unidentified

            if is_unidentified or is_temp_duplicate or is_garbage:
                continue

            # منع التكرار لنفس العدد الإداري
            doc_key = f"{dn}_{item.get('date', '')}"
            if doc_key in seen_doc_numbers and dn not in ["-", "غير محدد"]:
                continue
            seen_doc_numbers.add(doc_key)
            clean_items.append(item)

        # إعادة ترقيم رموز الفهرسة بالتسلسل المنظم
        for idx, item in enumerate(clean_items):
            axis = item.get("axis", "axis1")
            p = item.get("paragraph", "1")
            axis_num = axis.replace("axis", "AX")
            item["ref_code"] = f"REF-{axis_num}-P{p}-{idx+1:02d}"

        with open(cache_file, "w", encoding="utf-8") as cf:
            json.dump({"success": True, "count": len(clean_items), "indexed_evidence_list": clean_items}, cf, ensure_ascii=False, indent=2)

        return JSONResponse({
            "success": True,
            "count": len(clean_items),
            "indexed_evidence_list": clean_items,
            "message": f"تم تفريغ الملفات العالقة بنجاح، والإبقاء على {len(clean_items)} وثيقة رسمية معتمدة."
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/clear-all-evidence")
async def clear_all_evidence():
    """
    تفريغ فهرس الأدلة بالكامل وإعادة ضبطه
    """
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
    try:
        with open(cache_file, "w", encoding="utf-8") as cf:
            json.dump({"success": True, "count": 0, "indexed_evidence_list": []}, cf, ensure_ascii=False, indent=2)
        return JSONResponse({"success": True, "count": 0, "indexed_evidence_list": []})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.delete("/api/delete-evidence/{ref_code}")
async def delete_evidence_item(ref_code: str):
    """
    حذف وثيقة محددة من فهرس الأدلة والكاش
    """
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
    if not os.path.exists(cache_file):
        return JSONResponse({"success": True, "count": 0, "indexed_evidence_list": []})

    try:
        with open(cache_file, "r", encoding="utf-8") as cf:
            data = json.load(cf)

        current_items = data.get("indexed_evidence_list", [])
        filtered_items = [e for e in current_items if e.get("ref_code") != ref_code]

        with open(cache_file, "w", encoding="utf-8") as cf:
            json.dump({"success": True, "count": len(filtered_items), "indexed_evidence_list": filtered_items}, cf, ensure_ascii=False, indent=2)

        return JSONResponse({
            "success": True,
            "count": len(filtered_items),
            "indexed_evidence_list": filtered_items,
            "deleted_ref_code": ref_code
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/calculate-score")
async def calculate_score(data: Dict[str, Any]):
    """
    احتساب الدرجات والأوزان والقيود والتفقيط وفق ضوابط الاستمارة 21
    """
    try:
        eval_result = calculate_evaluation(data)
        return JSONResponse({"success": True, "evaluation": eval_result})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/export-docx")
async def export_docx(req: EvaluationRequest):
    """
    تصدير الاستمارة رقم 21 بصيغة Word (.docx) مطابقة للنموذج الوزاري مع جدول المرفقات
    """
    try:
        doc_id = str(uuid.uuid4())[:8]
        out_name = f"استمارة_تقييم_الأداء_2026_{doc_id}.docx"
        out_path = os.path.join(EXPORTS_DIR, out_name)

        create_form_21_docx(req.form_data, out_path, req.attachments)

        return FileResponse(
            out_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=out_name
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/export-pdf")
async def export_pdf(req: EvaluationRequest):
    """
    تصدير الاستمارة رقم 21 بصيغة PDF عالية الدقة مع التنسيقات الرسمية
    """
    try:
        doc_id = str(uuid.uuid4())[:8]
        out_name = f"استمارة_تقييم_الأداء_2026_{doc_id}.pdf"
        out_path = os.path.join(EXPORTS_DIR, out_name)

        create_form_21_pdf(req.form_data, out_path, req.attachments)

        return FileResponse(
            out_path,
            media_type="application/pdf",
            filename=out_name
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/export-dossier-pdf")
async def export_dossier_pdf(req: EvaluationRequest):
    """
    تصدير المصبار التوثيقي المدمج فائق الدقة (Consolidated Portfolio PDF)
    يدمج صفحات استمارة 21 مع كافة الوثائق والمرفقات الأصلية في ملف PDF واحد متكامل
    مع روابط تشعبية وفهارس تفاعلية (Interactive Bookmarks)
    """
    try:
        from core.pdf_generator import create_consolidated_dossier_pdf
        doc_id = str(uuid.uuid4())[:8]
        out_name = f"المصبار_التوثيقي_المدمج_2026_{doc_id}.pdf"
        out_path = os.path.join(EXPORTS_DIR, out_name)

        create_consolidated_dossier_pdf(
            data=req.form_data,
            output_path=out_path,
            attachments=req.attachments,
            uploads_base_dir=UPLOADS_DIR
        )

        return FileResponse(
            out_path,
            media_type="application/pdf",
            filename=out_name
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


class SnippetRequest(BaseModel):
    image_base64: str = ""
    file_path: str = ""
    crop_coords: Optional[Dict[str, float]] = None  # x, y, width, height in %
    crop_box: Optional[Dict[str, float]] = None    # top, left, width, height in %


@app.post("/api/scan-snippet")
async def scan_snippet(req: SnippetRequest):
    """
    مسح وتحليل جزء مقتطع بالماوس من الوثيقة (Interactive Snippet Cropper)
    """
    try:
        from PIL import Image as PILImage
        import io
        import base64
        
        target_img = None
        if req.image_base64:
            b64_clean = req.image_base64.split(",")[-1]
            img_bytes = base64.b64decode(b64_clean)
            target_img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")
        elif req.file_path:
            raw_fn = os.path.basename(req.file_path)
            cand = os.path.join(UPLOADS_DIR, raw_fn)
            if os.path.exists(cand):
                ext = os.path.splitext(cand)[1].lower()
                if ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
                    target_img = PILImage.open(cand).convert("RGB")
                elif ext == ".pdf":
                    from core.ocr_engine import convert_pdf_first_page_to_image
                    page_img = convert_pdf_first_page_to_image(cand)
                    if page_img and os.path.exists(page_img):
                        target_img = PILImage.open(page_img).convert("RGB")

        if not target_img:
            # صورة افتراضية في حالة الاختبار أو عدم توفر ملف محلي
            target_img = PILImage.new("RGB", (400, 200), color=(255, 255, 255))

        coords = req.crop_coords or req.crop_box
        if coords:
            w, h = target_img.size
            cx_val = coords.get("left", coords.get("x", 0))
            cy_val = coords.get("top", coords.get("y", 0))
            cw_val = coords.get("width", 100)
            ch_val = coords.get("height", 100)
            
            cx = max(0, min(w - 1, int((cx_val / 100.0) * w)))
            cy = max(0, min(h - 1, int((cy_val / 100.0) * h)))
            cw = max(10, int((cw_val / 100.0) * w))
            ch = max(10, int((ch_val / 100.0) * h))
            target_img = target_img.crop((cx, cy, min(w, cx + cw), min(h, cy + ch)))

        temp_crop = os.path.join(UPLOADS_DIR, f"crop_{uuid.uuid4().hex[:8]}.png")
        target_img.save(temp_crop, "PNG")

        ocr_res = process_document(temp_crop)
        txt = ocr_res.get("text", "")

        from core.document_parser import extract_document_number, extract_dates, extract_subject_or_title
        doc_no = extract_document_number(txt)
        dts = extract_dates(txt)
        subj = extract_subject_or_title(txt)

        if os.path.exists(temp_crop):
            os.remove(temp_crop)

        return JSONResponse({
            "success": True,
            "text": txt,
            "extracted_number": str(doc_no) if doc_no else "",
            "extracted_date": str(dts[0]) if dts else "",
            "doc_number": str(doc_no) if doc_no else "",
            "date": str(dts[0]) if dts else "",
            "subject": subj or ""
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


class DoiRequest(BaseModel):
    doi: str = ""
    journal_title: str = ""
    ref_code: str = ""
    faculty_name: str = "أحمد لؤي أحمد"


@app.post("/api/check-doi")
async def check_doi_endpoint(req: DoiRequest):
    """
    التحقق من معرف الـ DOI واسترجاع بيانات البحث ومؤشرات سكوباس
    """
    try:
        from core.scopus_crossref import fetch_doi_metadata, match_offline_journal, calculate_paper_score_and_role
        clean_doi = req.doi.strip()
        meta = fetch_doi_metadata(clean_doi) if clean_doi else None
        
        j_name = req.journal_title or (meta or {}).get("journal", "")
        scopus_info = match_offline_journal(j_name)
        cs = scopus_info.get("citescore", 2.0) if scopus_info else 1.5

        scoring = calculate_paper_score_and_role(
            text=(meta.get("title", "") if meta else (j_name or clean_doi)),
            faculty_name=req.faculty_name,
            citescore=cs,
            is_scopus=True
        )

        return JSONResponse({
            "success": True,
            "doi": clean_doi,
            "journal_title": j_name,
            "metadata": meta,
            "scopus_info": scopus_info,
            "scoring": scoring,
            "suggested_score": scoring.get("suggested_score", 60.0)
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


class AuditStatusRequest(BaseModel):
    ref_code: str
    status: str  # approved, modified, rejected
    notes: str = ""
    modified_score: Optional[float] = None


@app.post("/api/save-audit-status")
async def save_audit_status_endpoint(req: AuditStatusRequest):
    """
    حفظ وتثبيت قرارات لجنة الجودة والتدقيق للوثيقة المحددة
    """
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
    try:
        data = {"indexed_evidence_list": []}
        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)

        updated = False
        for item in data.get("indexed_evidence_list", []):
            if item.get("ref_code") == req.ref_code:
                item["audit_status"] = req.status
                item["auditor_notes"] = req.notes
                if req.modified_score is not None:
                    item["suggested_score"] = req.modified_score
                updated = True
                break

        if not updated:
            axis = "axis1"
            para = "1"
            m = re.match(r'REF-AX(\d+)-P(\d+)', req.ref_code)
            if m:
                axis = f"axis{m.group(1)}"
                para = m.group(2)
            data.setdefault("indexed_evidence_list", []).append({
                "ref_code": req.ref_code,
                "axis": axis,
                "paragraph": para,
                "axis_name": f"المحور {axis.replace('axis', '')}",
                "paragraph_name": f"الفقرة {para}",
                "doc_type": "وثيقة رسمية معتمدة",
                "title": f"وثيقة إثبات [{req.ref_code}]",
                "audit_status": req.status,
                "auditor_notes": req.notes,
                "suggested_score": req.modified_score or 20.0
            })

        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        return JSONResponse({"success": True, "status": req.status, "message": f"تم تحديث حالة تدقيق الوثيقة [{req.ref_code}] بنجاح."})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


class UpdateEvidenceMetaRequest(BaseModel):
    ref_code: str
    doc_number: Optional[str] = None
    date: Optional[str] = None
    title: Optional[str] = None
    doc_type: Optional[str] = None
    issuer: Optional[str] = None
    notes: Optional[str] = None


@app.post("/api/update-evidence-meta")
async def update_evidence_meta_endpoint(req: UpdateEvidenceMetaRequest):
    """
    تحديث بيانات الوثيقة المحددة (العدد، التاريخ، العنوان) في الفهرس الشامل وسجلات الكاش
    """
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
    try:
        data = {"indexed_evidence_list": []}
        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)

        updated_item = None
        for item in data.get("indexed_evidence_list", []):
            if item.get("ref_code") == req.ref_code:
                if req.doc_number is not None:
                    item["doc_number"] = req.doc_number
                    item["document_number"] = req.doc_number
                if req.date is not None:
                    item["date"] = req.date
                if req.title is not None:
                    item["title"] = req.title
                    item["subject"] = req.title
                if req.doc_type is not None:
                    item["doc_type"] = req.doc_type
                if req.issuer is not None:
                    item["issuer"] = req.issuer
                item["audit_status"] = "modified"
                updated_item = item
                break

        if updated_item:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return JSONResponse({
                "success": True,
                "item": updated_item,
                "message": f"تم تحديث بيانات الوثيقة [{req.ref_code}] بنجاح."
            })
        else:
            return JSONResponse(status_code=404, content={"success": False, "error": f"الوثيقة [{req.ref_code}] غير موجودة في الفهرس."})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


class SyncEvidenceRequest(BaseModel):
    indexed_evidence_list: List[Dict[str, Any]]


@app.post("/api/sync-evidence-catalog")
async def sync_evidence_catalog_endpoint(req: SyncEvidenceRequest):
    """
    مزامنة فهرس الأدلة والمرفقات المعتمدة بين المتصفح والخادم لحمايتها من أي فقدان
    """
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
    try:
        with open(cache_file, "w", encoding="utf-8") as cf:
            json.dump({
                "success": True,
                "count": len(req.indexed_evidence_list),
                "indexed_evidence_list": req.indexed_evidence_list
            }, cf, ensure_ascii=False, indent=2)
        return JSONResponse({"success": True, "count": len(req.indexed_evidence_list)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


class ReclassifyEvidenceRequest(BaseModel):
    ref_code: str
    axis: Optional[str] = None
    new_axis: Optional[str] = None
    paragraph: Optional[str] = None
    new_paragraph: Optional[str] = None
    axis_name: Optional[str] = ""
    new_axis_name: Optional[str] = ""
    paragraph_name: Optional[str] = ""
    new_paragraph_name: Optional[str] = ""
    doc_type: Optional[str] = ""
    new_doc_type: Optional[str] = ""
    suggested_score: Optional[float] = None
    new_score: Optional[float] = None
    auditor_notes: Optional[str] = ""
    notes: Optional[str] = ""


@app.post("/api/reclassify-evidence")
async def reclassify_evidence_endpoint(req: ReclassifyEvidenceRequest):
    """
    تعديل تصنيف الوثيقة ونقلها إلى محور وفقرة أخرى مع تحديث الدرجة ونوع الوثيقة
    """
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexed_results_cache.json")
    try:
        is_list_format = False
        data = {"indexed_evidence_list": []}
        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
                if isinstance(raw_data, list):
                    is_list_format = True
                    data = {"indexed_evidence_list": raw_data}
                elif isinstance(raw_data, dict):
                    data = raw_data

        target_axis = req.new_axis or req.axis or "axis1"
        target_paragraph = str(req.new_paragraph or req.paragraph or "1")
        target_axis_name = req.new_axis_name or req.axis_name or ""
        target_para_name = req.new_paragraph_name or req.paragraph_name or ""
        target_doc_type = req.new_doc_type or req.doc_type or ""
        target_score = req.new_score if req.new_score is not None else req.suggested_score
        target_notes = req.notes or req.auditor_notes or ""

        updated_item = None
        for item in data.get("indexed_evidence_list", []):
            if item.get("ref_code") == req.ref_code:
                item["axis"] = target_axis
                item["paragraph"] = target_paragraph
                if target_axis_name:
                    item["axis_name"] = target_axis_name
                if target_para_name:
                    item["paragraph_name"] = target_para_name
                if target_doc_type:
                    item["doc_type"] = target_doc_type
                if target_score is not None:
                    item["suggested_score"] = float(target_score)
                item["auditor_notes"] = target_notes or item.get("auditor_notes", "")
                item["audit_status"] = "modified"
                item["manual_reclassified"] = True
                updated_item = item
                break

        if not updated_item:
            new_item = {
                "ref_code": req.ref_code,
                "axis": target_axis,
                "paragraph": target_paragraph,
                "axis_name": target_axis_name,
                "paragraph_name": target_para_name,
                "doc_type": target_doc_type or "وثيقة رسمية",
                "suggested_score": float(target_score or 20.0),
                "auditor_notes": target_notes or "",
                "audit_status": "modified",
                "manual_reclassified": True
            }
            data.setdefault("indexed_evidence_list", []).append(new_item)
            updated_item = new_item

        with open(cache_file, "w", encoding="utf-8") as f:
            if is_list_format:
                json.dump(data.get("indexed_evidence_list", []), f, ensure_ascii=False, indent=2)
            else:
                json.dump(data, f, ensure_ascii=False, indent=2)

        return JSONResponse({
            "success": True,
            "message": f"تم نقل وتعديل تصنيف الوثيقة [{req.ref_code}] بنجاح.",
            "item": updated_item,
            "updated_item": updated_item,
            "indexed_evidence_list": data["indexed_evidence_list"]
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})



@app.get("/api/vlm-config")
async def get_vlm_config_endpoint():
    from core.vlm_engine import load_vlm_config
    cfg = load_vlm_config()
    cfg["success"] = True
    return JSONResponse(cfg)


@app.post("/api/vlm-config")
async def update_vlm_config_endpoint(req: Dict[str, Any]):
    from core.vlm_engine import save_vlm_config, load_vlm_config
    cfg = load_vlm_config()
    cfg.update(req)
    save_vlm_config(cfg)
    return JSONResponse({"success": True, "config": cfg})


@app.get("/api/sample-data")
async def get_sample_data():
    """
    تجهيز بيانات تدريسي افتراضي نموذجية لاختبار المنصة بضغطة زر
    """
    sample = {
        "personal_info": {
            "university": "الجامعة التكنولوجية",
            "college": "كلية هندسة العمارة",
            "department": "قسم هندسة التصميم المعماري",
            "form_no": "2026/0412",
            "form_code": "AGY-2026-ARCH-01",
            "first_name": "أحمد",
            "father_name": "لؤي",
            "grandfather_name": "أحمد",
            "great_grandfather_name": "",
            "last_name": "",
            "mother_name": "فاطمة",
            "mother_father_name": "محمد",
            "mother_grandfather_name": "علي",
            "national_id": "198520349812",
            "registry_no": "142",
            "page_no": "58",
            "issue_year": "2021",
            "issue_month": "05",
            "issue_day": "12",
            "degree": "دكتوراه",
            "order_no_and_date": "ق/452 في 2018/06/10",
            "degree_year": "2018",
            "degree_month": "06",
            "degree_day": "10",
            "granting_country": "العراق",
            "granting_univ": "الجامعة التكنولوجية",
            "granting_college": "كلية هندسة العمارة",
            "granting_dept": "قسم هندسة التصميم المعماري",
            "general_specialty": "هندسة معمارية",
            "specific_specialty": "تصميم معماري وتكنولوجيا البناء",
            "academic_title": "أستاذ مساعد",
            "title_granter": "مجلس الجامعة التكنولوجية",
            "title_year": "2022",
            "title_month": "03",
            "title_day": "15",
            "phone": "07701234567",
            "email": "ahmed.l.ahmed@uotechnology.edu.iq"
        },
        "is_non_teaching": False,
        "axis1": {
            "courses_score": 20,
            "classroom_management_score": 20,
            "blended_learning_items": [5, 5, 5, 5],
            "course_description_items": [4, 4, 4, 4, 4],
            "job_commitment_items": [4, 4, 4, 4, 4]
        },
        "axis2": {
            "global_research_score": 60,
            "local_research_score": 25,
            "supervision_score": 15
        },
        "axis3": {
            "committees_score": 30,
            "continuous_learning_score": 20,
            "thank_you_score": 20,
            "field_visits_score": 30
        },
        "axis4": {
            "items": {
                "item1": 3,
                "item2": 4,
                "item11": 3
            }
        },
        "axis5": {
            "penalties": []
        },
        "sample_attachments": [
            {
                "type_arabic": "كتاب شكر وتقدير",
                "document_number": "م.و/1042",
                "date": "2025/11/15",
                "title": "كتاب شكر وتقدير من معالي وزير التعليم العالي والبحث العلمي للجهود البحثية المتميزة",
                "axis_name": "المحور الثالث: الجانب التربوي والإرشادي",
                "suggested_paragraph": "3",
                "suggested_score": 20.0,
                "file_path": "/uploads/d2664b65-4392-4d19-84a6-822fa79a0946_شكر وتقدير 963.pdf",
                "filename": "كتاب شكر وتقدير وزاري 963.pdf"
            },
            {
                "type_arabic": "بحث منشور في مستوعب عالمي",
                "document_number": "10.1016/j.conbuildmat.2025.132890",
                "date": "2025/08/20",
                "title": "Sustainable Self-Compacting Geopolymer Concrete (Scopus CiteScore 6.2 - First Author)",
                "axis_name": "المحور الثاني: النشاط العلمي والبحثي",
                "suggested_paragraph": "1",
                "suggested_score": 60.0,
                "file_path": "/uploads/960c2f7e-8e04-4bf0-aa09-a9630ab537df_Ahmed Louay Ahmed - Fellowship.pdf",
                "filename": "Ahmed Louay Ahmed - Scopus Research.pdf"
            },
            {
                "type_arabic": "أمر إداري بتشكيل لجنة",
                "document_number": "4892",
                "date": "2025/09/28",
                "title": "أمر إداري بتشكيل اللجنة الامتحانية المركزية للعام الدراسي 2025-2026",
                "axis_name": "المحور الثالث: الجانب التربوي والإرشادي",
                "suggested_paragraph": "1",
                "suggested_score": 30.0,
                "file_path": "/uploads/64af219a-a049-497d-858a-a02066899af1_أمر اداري تكليف مشاركة مناقشة مشاريع تخرج المرحلة الخامسة .pdf",
                "filename": "أمر تشكيل لجنة مناقشة مشاريع التخرج.pdf"
            },
            {
                "type_arabic": "وثيقة معامل هيرش h-index",
                "document_number": "Scopus-Author-572019482",
                "date": "2025/10/05",
                "title": "توثيق امتلاك معامل هيرش h-index = 7 على قاعدة بيانات Scopus",
                "axis_name": "المحور الرابع: مواطن القوة",
                "suggested_paragraph": "2",
                "suggested_score": 4.0,
                "file_path": "/uploads/1ffd53df-196a-4042-96f7-d7761b31323c_عضوية تحرير المجلة العراقية.pdf",
                "filename": "عضوية تحرير المجلة ومواطن القوة.pdf"
            }
        ]
    }
    return JSONResponse({"success": True, "sample": sample})


# تقديم الملفات المرفوعة للتحميل أو العرض
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/exports", StaticFiles(directory=EXPORTS_DIR), name="exports")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/js", StaticFiles(directory=os.path.join(STATIC_DIR, "js")), name="js")
app.mount("/css", StaticFiles(directory=os.path.join(STATIC_DIR, "css")), name="css")


@app.get("/")
async def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>منصة تقييم أداء الهيئة التدريسية - استمارة 21</h1>")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
