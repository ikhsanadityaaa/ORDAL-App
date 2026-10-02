import os
import tempfile

from pypdf import PdfReader

from workers.cv_ats_service import analyze_cv, render_optimized_pdf


SAMPLE = {
    "name": "Rina Pratama",
    "headline": "Procurement Specialist",
    "contact": {
        "email": "rina@example.com",
        "phone": "+62 812 3456 7890",
        "location": "Jakarta",
        "linkedin": "linkedin.com/in/rinapratama",
    },
    "summary": "Procurement specialist with experience managing vendors and purchase orders.",
    "skills": ["Vendor Management", "Sourcing", "Purchase Orders", "Excel"],
    "experience": [
        {
            "role": "Procurement Specialist",
            "company": "PT Contoh",
            "location": "Jakarta",
            "start": "January 2022",
            "end": "Present",
            "bullets": [
                "Managed sourcing and purchase orders for operational requirements.",
                "Reduced supplier lead time by 15% using documented vendor reviews.",
            ],
        }
    ],
    "education": [{"degree": "Bachelor of Management", "school": "Universitas Contoh", "location": "Jakarta", "start": "2017", "end": "2021", "details": []}],
    "certifications": [],
    "languages": ["Bahasa Indonesia", "English"],
}


with tempfile.TemporaryDirectory() as temp_dir:
    output = os.path.join(temp_dir, "optimized.pdf")
    render_optimized_pdf(SAMPLE, output)
    reader = PdfReader(output)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert 1 <= len(reader.pages) <= 2
    assert "Rina Pratama" in text
    assert "Reduced supplier lead time by 15%" in text
    report = analyze_cv(output, text, "Procurement Specialist")
    assert report["score"] >= 70, report
    assert sum(item["max_score"] for item in report["criteria"]) == 100

print("cv ATS self-check passed")
