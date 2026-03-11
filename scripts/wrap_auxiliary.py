# -*- coding: utf-8 -*-
"""
보조지표 섹션(3916~4505줄)을 상위 토글로 감싸기
state 추가로 인해 줄 번호가 2줄 증가했으므로 3918~4507줄이 대상
"""

FILEPATH = 'components/inventory/InventoryDashboard.tsx'

with open(FILEPATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

START = 3916 - 1  # 0-indexed
END   = 4505 - 1  # 0-indexed (inclusive)

# 들여쓰기 기준: 3918줄 들여쓰기 확인
indent = len(lines[START]) - len(lines[START].lstrip())
pad = ' ' * indent

# 상위 wrapper 시작 삽입 (START 앞에)
wrapper_open = (
    f'{pad}{{/* 재고자산 보조지표 상위 토글 */}}\n'
    f'{pad}<div className="mt-12 border-t-2 border-gray-400 pt-6">\n'
    f'{pad}  <button\n'
    f'{pad}    type="button"\n'
    f'{pad}    onClick={{() => setAuxiliaryOpen((v) => !v)}}\n'
    f'{pad}    className="flex items-center gap-2 w-full text-left py-2 mb-2"\n'
    f'{pad}  >\n'
    f'{pad}    <span className="text-base font-bold text-slate-800">재고자산 보조지표</span>\n'
    f'{pad}    <span className="ml-auto text-gray-400 text-sm shrink-0">\n'
    f'{pad}      {{auxiliaryOpen ? \'접기 ▲\' : \'펼치기 ▼\'}}\n'
    f'{pad}    </span>\n'
    f'{pad}  </button>\n'
    f'{pad}  {{auxiliaryOpen && (\n'
    f'{pad}    <div>\n'
)

# 상위 wrapper 닫힘 (END 뒤에)
wrapper_close = (
    f'{pad}    </div>\n'
    f'{pad}  )}}\n'
    f'{pad}</div>\n'
)

# 조립
new_lines = (
    lines[:START]
    + [wrapper_open]
    + lines[START:END + 1]
    + [wrapper_close]
    + lines[END + 1:]
)

with open(FILEPATH, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'완료: {START+1}~{END+1}줄을 상위 토글로 감쌌습니다.')
print(f'삽입된 wrapper 시작: {START+1}줄 앞')
print(f'삽입된 wrapper 끝: {END+1}줄 뒤')
