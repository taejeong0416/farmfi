"""Kiwi 바이너리 스키마·메시지 디코더.

Figma `.fig` 안의 `canvas.fig`가 쓰는 포맷이다. 스키마를 먼저 읽고,
그 스키마로 데이터를 해석한다.
"""
import struct

BOOL, BYTE, INT, UINT, FLOAT, STRING = -1, -2, -3, -4, -5, -6
INT64, UINT64 = -7, -8
ENUM, STRUCT, MESSAGE = 0, 1, 2


class Reader:
    def __init__(self, buf):
        self.b = buf
        self.i = 0

    def byte(self):
        v = self.b[self.i]
        self.i += 1
        return v

    def varint(self):
        shift = 0
        result = 0
        while True:
            b = self.byte()
            result |= (b & 0x7F) << shift
            shift += 7
            if not (b & 0x80):
                break
        return result & 0xFFFFFFFF

    def svarint(self):
        v = self.varint()
        return (v >> 1) ^ -(v & 1)

    def varint64(self):
        # 32비트와 달리 연속 바이트는 8개까지다. 9번째는 종료 비트 없이
        # 8비트 전부가 값이라 최대 길이가 9바이트로 고정된다.
        result = 0
        shift = 0
        while shift < 56:
            b = self.byte()
            result |= (b & 0x7F) << shift
            if not (b & 0x80):
                return result
            shift += 7
        return (result | (self.byte() << 56)) & 0xFFFFFFFFFFFFFFFF

    def svarint64(self):
        v = self.varint64()
        return (v >> 1) ^ -(v & 1)

    def float(self):
        if self.b[self.i] == 0:
            self.i += 1
            return 0.0
        v = struct.unpack('<I', self.b[self.i:self.i + 4])[0]
        self.i += 4
        # kiwi는 지수부를 하위 바이트에 두도록 회전시켜 저장한다. 되돌린다.
        v = ((v << 23) | (v >> 9)) & 0xFFFFFFFF
        return struct.unpack('<f', struct.pack('<I', v))[0]

    def string(self):
        start = self.i
        while self.b[self.i] != 0:
            self.i += 1
        s = self.b[start:self.i].decode('utf-8', 'replace')
        self.i += 1
        return s


def parse_schema(buf):
    r = Reader(buf)
    defs = []
    for _ in range(r.varint()):
        name = r.string()
        kind = r.byte()
        fields = []
        for _ in range(r.varint()):
            fields.append({
                'name': r.string(),
                'type': r.svarint(),
                'array': bool(r.byte()),
                'value': r.varint(),
            })
        defs.append({'name': name, 'kind': kind, 'fields': fields})
    return defs


class Decoder:
    def __init__(self, defs):
        self.defs = defs
        self.by_name = {d['name']: i for i, d in enumerate(defs)}

    def value(self, r, t, array):
        if array:
            return [self.value(r, t, False) for _ in range(r.varint())]
        if t == BOOL:
            return bool(r.byte())
        if t == BYTE:
            return r.byte()
        if t == INT:
            return r.svarint()
        if t == UINT:
            return r.varint()
        if t == FLOAT:
            return r.float()
        if t == STRING:
            return r.string()
        if t == INT64:
            return r.svarint64()
        if t == UINT64:
            return r.varint64()
        if t < 0:
            raise ValueError(f'모르는 기본 타입 {t}')
        d = self.defs[t]
        if d['kind'] == ENUM:
            v = r.varint()
            for f in d['fields']:
                if f['value'] == v:
                    return f['name']
            return v
        return self.compound(r, d)

    def compound(self, r, d):
        out = {}
        if d['kind'] == STRUCT:
            for f in d['fields']:
                out[f['name']] = self.value(r, f['type'], f['array'])
            return out
        while True:
            fid = r.varint()
            if fid == 0:
                return out
            f = next((x for x in d['fields'] if x['value'] == fid), None)
            if f is None:
                raise ValueError(f"unknown field {fid} in {d['name']}")
            out[f['name']] = self.value(r, f['type'], f['array'])

    def decode(self, buf, root='Message'):
        return self.compound(Reader(buf), self.defs[self.by_name[root]])
