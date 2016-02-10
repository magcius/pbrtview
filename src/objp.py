
import itertools
import struct

def parse_obj(obj_file):
    v = ['dummy']
    vn = ['dummy']
    f = []

    def parse3(p):
        return tuple(float(a) for a in p)

    def parsef(p):
        def parsefv(fp):
            vi, tcs, vni = fp.split('/')
            return v[int(vi)], vn[int(vni)]

        return list(itertools.chain(parsefv(a) for a in p))

    for line in obj_file:
        line = line.strip()
        if line == '':
            continue

        parts = line.split()
        cmd, param = parts[0], parts[1:]

        if cmd == 'v':
            v.append(parse3(param))
        elif cmd == 'vn':
            vn.append(parse3(param))
        elif cmd == 'f':
            f.append(parsef(param))

    return f

def write_obj(out, f):
    out.write('JMDL')
    print "Packing %d faces..." % (len(f),)
    out.write(struct.pack('>I', len(f)))
    out.write('JVTX')
    for verts in f:
        for v in verts:
            out.write(struct.pack('fff', v[0][0], v[0][1], v[0][2]))
    out.write('JNRM')
    for verts in f:
        for v in verts:
            out.write(struct.pack('fff', v[1][0], v[1][1], v[1][2]))

def main():
    import sys

    with open(sys.argv[1], 'rb') as inf:
        f = parse_obj(inf)

    with open(sys.argv[2], 'wb') as outf:
        write_obj(outf, f)

if __name__ == "__main__":
    main()
