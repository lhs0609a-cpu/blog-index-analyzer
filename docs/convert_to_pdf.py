# -*- coding: utf-8 -*-
"""
마크다운 사업계획서를 PDF로 변환하는 스크립트
"""

from fpdf import FPDF
import re
import os

class PDF(FPDF):
    def __init__(self):
        super().__init__()
        # 한글 폰트 설정 (맑은 고딕)
        self.add_font('Malgun', '', 'C:/Windows/Fonts/malgun.ttf')
        self.add_font('Malgun', 'B', 'C:/Windows/Fonts/malgunbd.ttf')
        self.set_auto_page_break(auto=True, margin=15)

    def header(self):
        self.set_font('Malgun', 'B', 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, 'Blrank 사업계획서 2026', new_x='RIGHT', new_y='TOP')
        self.ln(15)

    def footer(self):
        self.set_y(-15)
        self.set_font('Malgun', '', 8)
        self.set_text_color(128)
        self.cell(0, 10, f'- {self.page_no()} -', new_x='RIGHT', new_y='TOP', align='C')

    def chapter_title(self, title, level=1):
        if level == 1:
            self.set_font('Malgun', 'B', 18)
            self.set_text_color(0, 100, 200)
        elif level == 2:
            self.set_font('Malgun', 'B', 14)
            self.set_text_color(50, 50, 50)
        else:
            self.set_font('Malgun', 'B', 12)
            self.set_text_color(80, 80, 80)

        self.multi_cell(0, 10, title)
        self.ln(4)

    def body_text(self, text):
        self.set_font('Malgun', '', 10)
        self.set_text_color(0, 0, 0)
        self.multi_cell(0, 6, text)
        self.ln(2)

    def bullet_point(self, text):
        self.set_font('Malgun', '', 10)
        self.set_text_color(0, 0, 0)
        self.multi_cell(0, 6, f"  - {text}")

def parse_markdown(md_content):
    """마크다운 내용을 파싱하여 구조화된 데이터로 변환"""
    lines = md_content.split('\n')
    elements = []

    in_code_block = False
    in_table = False
    table_data = []

    for line in lines:
        # 코드 블록 처리
        if line.strip().startswith('```'):
            in_code_block = not in_code_block
            if in_code_block:
                elements.append(('code_start', ''))
            else:
                elements.append(('code_end', ''))
            continue

        if in_code_block:
            elements.append(('code', line))
            continue

        # 테이블 처리
        if '|' in line and line.strip().startswith('|'):
            if not in_table:
                in_table = True
                table_data = []

            # 구분선 무시
            if re.match(r'^[\|\-\:\s]+$', line.strip()):
                continue

            cells = [c.strip() for c in line.split('|')[1:-1]]
            table_data.append(cells)
            continue
        elif in_table:
            in_table = False
            elements.append(('table', table_data))
            table_data = []

        # 제목 처리
        if line.startswith('# '):
            elements.append(('h1', line[2:].strip()))
        elif line.startswith('## '):
            elements.append(('h2', line[3:].strip()))
        elif line.startswith('### '):
            elements.append(('h3', line[4:].strip()))
        elif line.startswith('#### '):
            elements.append(('h4', line[5:].strip()))
        # 리스트 처리
        elif line.strip().startswith('- ') or line.strip().startswith('* '):
            text = line.strip()[2:]
            elements.append(('bullet', text))
        elif re.match(r'^\d+\. ', line.strip()):
            text = re.sub(r'^\d+\. ', '', line.strip())
            elements.append(('bullet', text))
        # 인용 처리
        elif line.strip().startswith('>'):
            text = line.strip()[1:].strip()
            elements.append(('quote', text))
        # 빈 줄
        elif line.strip() == '':
            elements.append(('blank', ''))
        # 수평선
        elif line.strip() in ['---', '***', '___']:
            elements.append(('hr', ''))
        # 일반 텍스트
        else:
            # 마크다운 서식 제거
            text = re.sub(r'\*\*([^*]+)\*\*', r'\1', line)  # 볼드
            text = re.sub(r'\*([^*]+)\*', r'\1', text)  # 이탤릭
            text = re.sub(r'`([^`]+)`', r'\1', text)  # 인라인 코드
            text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # 링크
            if text.strip():
                elements.append(('text', text.strip()))

    return elements

def create_pdf(md_file, pdf_file):
    """마크다운 파일을 PDF로 변환"""

    # 마크다운 파일 읽기
    with open(md_file, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # 파싱
    elements = parse_markdown(md_content)

    # PDF 생성
    pdf = PDF()
    pdf.add_page()

    in_code = False

    for elem_type, content in elements:
        try:
            if elem_type == 'h1':
                pdf.add_page()
                pdf.chapter_title(content, 1)
            elif elem_type == 'h2':
                pdf.ln(5)
                pdf.chapter_title(content, 2)
            elif elem_type == 'h3':
                pdf.ln(3)
                pdf.chapter_title(content, 3)
            elif elem_type == 'h4':
                pdf.set_font('Malgun', 'B', 11)
                pdf.set_text_color(60, 60, 60)
                pdf.multi_cell(0, 8, content)
            elif elem_type == 'text':
                pdf.body_text(content)
            elif elem_type == 'bullet':
                pdf.bullet_point(content)
            elif elem_type == 'quote':
                pdf.set_font('Malgun', '', 10)
                pdf.set_text_color(100, 100, 100)
                pdf.multi_cell(0, 6, f'  "{content}"')
                pdf.set_text_color(0, 0, 0)
            elif elem_type == 'code_start':
                in_code = True
                pdf.set_fill_color(245, 245, 245)
                pdf.set_font('Malgun', '', 9)
            elif elem_type == 'code_end':
                in_code = False
                pdf.ln(3)
            elif elem_type == 'code':
                if in_code:
                    pdf.multi_cell(0, 5, content, fill=True)
            elif elem_type == 'table':
                # 테이블 렌더링
                pdf.ln(3)
                if content and len(content) > 0 and len(content[0]) > 0:
                    col_count = len(content[0])
                    col_width = min(40, (pdf.w - 30) / col_count)
                    pdf.set_font('Malgun', 'B', 8)
                    pdf.set_fill_color(230, 230, 230)

                    # 헤더
                    for cell in content[0]:
                        text = str(cell)[:15] if cell else ''
                        pdf.cell(col_width, 6, text, 1, 0, 'C', True)
                    pdf.ln()

                    # 데이터
                    pdf.set_font('Malgun', '', 8)
                    pdf.set_fill_color(255, 255, 255)
                    for row in content[1:]:
                        for i, cell in enumerate(row):
                            if i < col_count:
                                text = str(cell)[:15] if cell else ''
                                pdf.cell(col_width, 5, text, 1, 0, 'C')
                        pdf.ln()
                pdf.ln(3)
            elif elem_type == 'hr':
                pdf.ln(5)
                pdf.set_draw_color(200, 200, 200)
                pdf.line(10, pdf.get_y(), 200, pdf.get_y())
                pdf.ln(5)
            elif elem_type == 'blank':
                pdf.ln(2)
        except Exception as e:
            print(f"Warning: {e} - skipping element")
            continue

    # PDF 저장
    pdf.output(pdf_file)
    print(f"PDF 생성 완료: {pdf_file}")

if __name__ == '__main__':
    docs_dir = os.path.dirname(os.path.abspath(__file__))

    # 사업계획서 본문
    md_file1 = os.path.join(docs_dir, '사업계획서_블랭크_2026.md')
    pdf_file1 = os.path.join(docs_dir, '사업계획서_블랭크_2026.pdf')

    # PPT 요약본
    md_file2 = os.path.join(docs_dir, '사업계획서_요약_PPT용.md')
    pdf_file2 = os.path.join(docs_dir, '사업계획서_요약_PPT용.pdf')

    if os.path.exists(md_file1):
        create_pdf(md_file1, pdf_file1)

    if os.path.exists(md_file2):
        create_pdf(md_file2, pdf_file2)

    print("\n모든 PDF 변환 완료!")
