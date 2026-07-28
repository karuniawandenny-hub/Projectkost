import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, getEffectiveOwnerId } from "@/lib/session";
import { formatDateID } from "@/lib/billing";
import { PrintButton } from "@/components/PrintButton";
import { BackButton } from "@/components/BackButton";
import { SignatureBlock } from "./SignatureBlock";

function formatDate(d: Date | null | undefined): string {
  return d ? formatDateID(d) : "—";
}

function formatDateTime(d: Date): string {
  return `${formatDateID(d)}, ${d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Kontrak sewa kos auto-generated. Mirror pattern receipt: HTML page
 * dengan tombol print -> save PDF via browser native.
 *
 * Akses:
 * - Tenant pemilik tenancy
 * - Owner kos
 * - Admin
 */
export default async function ContractPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireUser();

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: params.id },
    include: {
      tenant: { select: { id: true, name: true, email: true, phone: true } },
      room: {
        include: {
          kos: {
            include: {
              owner: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  defaultSignatureUrl: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!tenancy) notFound();

  const isTenant = tenancy.tenant.id === me.id;
  // isOwner = pemilik ASLI kos ini (bukan MANAGER). Kontrak sewa adalah
  // dokumen legal antar dua pribadi — MANAGER tidak boleh tandatangan
  // atas nama owner.
  const isOwner = tenancy.room.kos.owner.id === me.id;
  // isManagerOfKos = anggota tim yang di-invite owner untuk mengelola.
  // Boleh LIHAT kontrak (transparansi tim), tapi tidak boleh tandatangan.
  const isManagerOfKos =
    me.role === "MANAGER" &&
    tenancy.room.kos.owner.id === getEffectiveOwnerId(me);
  const isAdmin = me.role === "ADMIN";
  if (!isTenant && !isOwner && !isManagerOfKos && !isAdmin) notFound();

  const contractNo = `KB-KT-${tenancy.id.slice(-8).toUpperCase()}`;
  const dueAnniversary = new Date(tenancy.startDate).getDate();

  // Apakah viewer saat ini perlu diingatkan tanda tangan? Hanya tampil
  // kalau dia yang berwenang ttd di kolom yang masih kosong.
  // MANAGER dan ADMIN tidak masuk banner ini walau kolom masih kosong.
  const ownerNeedsToSign = isOwner && !tenancy.ownerSignatureUrl;
  const tenantNeedsToSign = isTenant && !tenancy.tenantSignatureUrl;

  return (
    <main className="bg-slate-100 min-h-screen p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl bg-white text-slate-900 shadow-md print:shadow-none">
        {/* Print controls */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between print:hidden">
          <BackButton fallbackHref="/dashboard" />
          <div className="flex-1 text-center text-xs text-slate-500">
            Kontrak sewa kos — Kos Baiti
          </div>
          <PrintButton />
        </div>

        {(ownerNeedsToSign || tenantNeedsToSign) && (
          <div className="border-b border-amber-300 bg-amber-50 px-6 py-3 text-sm text-amber-900 no-print">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span>
                ✍️ Anda belum menandatangani kontrak ini sebagai{" "}
                <strong>
                  {ownerNeedsToSign ? "PIHAK PERTAMA" : "PIHAK KEDUA"}
                </strong>
                . Scroll ke bawah untuk menandatangani.
              </span>
              <a
                href="#signatures"
                className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600"
              >
                Lompat ke tanda tangan ↓
              </a>
            </div>
          </div>
        )}

        {isManagerOfKos && (
          <div className="border-b border-blue-200 bg-blue-50 px-6 py-3 text-sm text-blue-900 no-print">
            👁️ Anda melihat kontrak ini sebagai <strong>anggota tim pengelola</strong>.
            Anda bisa membaca &amp; mencetak, tapi <strong>tidak dapat
            menandatangani</strong> — tandatangan pihak pertama harus dilakukan
            langsung oleh pemilik kos.
          </div>
        )}

        <article className="px-8 py-8 sm:px-12 sm:py-10 print:px-12 print:py-10">
          {/* Header */}
          <div className="text-center border-b-2 border-slate-300 pb-4">
            <div className="text-xs uppercase tracking-widest text-slate-500">
              Surat Perjanjian Sewa
            </div>
            <h1 className="mt-2 text-2xl font-bold uppercase">
              Kontrak Sewa Kamar Kos
            </h1>
            <div className="mt-2 text-xs text-slate-500">
              No. Kontrak: <span className="font-mono font-medium">{contractNo}</span>
            </div>
          </div>

          {/* Pembukaan */}
          <p className="mt-6 text-sm leading-relaxed">
            Pada hari ini,{" "}
            <strong>{formatDate(tenancy.startDate)}</strong>, telah dibuat dan
            disepakati kontrak sewa kamar kos antara kedua belah pihak yang
            namanya tercantum di bawah ini.
          </p>

          {/* Pihak Pertama (Owner) */}
          <PartyBlock
            title="Pihak Pertama (Pemilik / Pengelola Kos)"
            rows={[
              ["Nama", tenancy.room.kos.owner.name],
              ["Email", tenancy.room.kos.owner.email],
              ["Nomor HP", tenancy.room.kos.owner.phone],
            ]}
            footer={
              <>
                Selanjutnya disebut sebagai <strong>PIHAK PERTAMA</strong>.
              </>
            }
          />

          {/* Pihak Kedua (Tenant) */}
          <PartyBlock
            className="mt-5"
            title="Pihak Kedua (Penghuni)"
            rows={[
              ["Nama", tenancy.tenant.name],
              ["Email", tenancy.tenant.email],
              ["Nomor HP", tenancy.tenant.phone],
            ]}
            footer={
              <>
                Selanjutnya disebut sebagai <strong>PIHAK KEDUA</strong>.
              </>
            }
          />

          {/* Objek Sewa */}
          <div className="mt-6 rounded-lg border border-slate-300 bg-slate-50/50 p-4">
            <h3 className="text-sm font-semibold uppercase text-slate-700">
              Objek Sewa
            </h3>
            <KVTable
              labelWidth="w-40"
              rows={[
                ["Nama Kos", tenancy.room.kos.name],
                ["Alamat", tenancy.room.kos.address],
                ["Nomor Kamar", tenancy.room.name],
                [
                  "Harga sewa / bulan",
                  `Rp ${tenancy.room.monthlyPrice.toLocaleString("id-ID")}`,
                  "font-semibold",
                ],
                [
                  "Tanggal mulai sewa",
                  formatDate(tenancy.startDate),
                  "font-medium",
                ],
                tenancy.endDate
                  ? ["Tanggal akhir sewa", formatDate(tenancy.endDate)]
                  : null,
              ]}
            />
          </div>

          {/* Ketentuan */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase text-slate-700">
              Ketentuan &amp; Kewajiban
            </h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                <strong>Pembayaran sewa</strong> dilakukan setiap bulan dengan
                jatuh tempo pada tanggal <strong>{dueAnniversary}</strong> setiap
                bulan, mengikuti tanggal mulai sewa. Sistem akan mengirimkan
                pengingat otomatis H-7, H-3, H-1 sebelum jatuh tempo melalui
                aplikasi, email, dan WhatsApp.
              </li>
              <li>
                <strong>Bukti pembayaran</strong> wajib diupload PIHAK KEDUA
                melalui aplikasi Kos Baiti, dan akan diverifikasi oleh PIHAK
                PERTAMA. Pembayaran dianggap lunas setelah status berubah
                menjadi <em>Verified</em>.
              </li>
              <li>
                <strong>Pemeliharaan kamar:</strong> PIHAK KEDUA wajib menjaga
                kebersihan, ketertiban, dan keamanan kamar serta area bersama.
                Setiap kerusakan akibat kelalaian PIHAK KEDUA menjadi tanggung
                jawab PIHAK KEDUA.
              </li>
              <li>
                <strong>Tamu &amp; akses:</strong> PIHAK KEDUA wajib melaporkan
                kepada PIHAK PERTAMA bila ada tamu menginap. Akses kunci kamar
                tidak boleh diberikan kepada pihak ketiga tanpa izin tertulis.
              </li>
              <li>
                <strong>Komplain &amp; perbaikan:</strong> Setiap kerusakan
                fasilitas yang bukan akibat kelalaian PIHAK KEDUA dapat
                dilaporkan melalui fitur Komplain di aplikasi Kos Baiti.
              </li>
              <li>
                <strong>Berakhirnya kontrak:</strong> Kontrak ini berlaku selama
                PIHAK KEDUA berstatus sebagai penghuni aktif di kos. PIHAK KEDUA
                yang ingin berhenti menyewa wajib memberitahukan PIHAK PERTAMA
                minimal 7 (tujuh) hari sebelumnya melalui aplikasi atau pesan
                langsung.
              </li>
              <li>
                <strong>Penyelesaian sengketa:</strong> Apabila terjadi
                perselisihan, kedua belah pihak sepakat menyelesaikan secara
                musyawarah. Bila tidak tercapai, akan diselesaikan sesuai hukum
                yang berlaku.
              </li>
            </ol>
          </div>

          {/* Pernyataan & TTD */}
          <p className="mt-6 text-sm leading-relaxed">
            Demikian kontrak sewa ini dibuat dan disepakati oleh kedua belah
            pihak dalam keadaan sehat jasmani dan rohani, tanpa paksaan dari
            pihak manapun. Dokumen ini sah secara elektronik melalui sistem Kos
            Baiti dan dapat dijadikan rujukan resmi.
          </p>

          {/* Tanda tangan elektronik. Pemilik tanda tangan sebagai pihak
              pertama, penghuni sebagai pihak kedua. Status sinkron
              dengan database — kalau sudah pernah tandatangan, blok
              menampilkan gambar; jika belum, tampil kanvas. */}
          <div id="signatures" className="mt-8 grid gap-8 scroll-mt-4 sm:grid-cols-2">
            <div className="text-center text-sm">
              <SignatureBlock
                tenancyId={tenancy.id}
                role="OWNER"
                signedUrl={tenancy.ownerSignatureUrl ?? null}
                signedAt={tenancy.ownerSignedAt ?? null}
                canSign={isOwner}
                defaultSignatureUrl={
                  isOwner ? tenancy.room.kos.owner.defaultSignatureUrl : null
                }
              />
              <div className="mt-1 font-semibold">
                {tenancy.room.kos.owner.name}
              </div>
              <div className="text-xs text-slate-500">Pemilik / Pengelola</div>
            </div>
            <div className="text-center text-sm">
              <SignatureBlock
                tenancyId={tenancy.id}
                role="TENANT"
                signedUrl={tenancy.tenantSignatureUrl ?? null}
                signedAt={tenancy.tenantSignedAt ?? null}
                canSign={isTenant}
                defaultSignatureUrl={null}
              />
              <div className="mt-1 font-semibold">{tenancy.tenant.name}</div>
              <div className="text-xs text-slate-500">Penghuni</div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 border-t border-slate-200 pt-4 text-center text-[10px] text-slate-500">
            Dokumen ini dicetak otomatis dari sistem Kos Baiti pada{" "}
            {formatDateTime(new Date())}. Validitas dokumen mengikuti data
            tenancy {contractNo} yang tersimpan di sistem.
          </div>
        </article>
      </div>
    </main>
  );
}

/**
 * Row label-value tuple. Item null/[label, null] di-skip otomatis,
 * berguna untuk field opsional seperti nomor HP yang belum diisi.
 * Item ke-3 (optional) adalah Tailwind class tambahan untuk value cell.
 */
type Row = [label: string, value: string | null | undefined, valueClass?: string] | null;

function KVTable({
  rows,
  labelWidth = "w-32",
}: {
  rows: Row[];
  labelWidth?: string;
}) {
  return (
    <table className="mt-2 w-full text-sm">
      <tbody>
        {rows.map((row, i) => {
          if (!row || !row[1]) return null;
          const [label, value, valueClass] = row;
          return (
            <tr key={i}>
              <td className={`${labelWidth} py-1 text-slate-500`}>{label}</td>
              <td className={`py-1 ${valueClass ?? ""}`}>: {value}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PartyBlock({
  title,
  rows,
  footer,
  className = "mt-6",
}: {
  title: string;
  rows: Row[];
  footer: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="text-sm font-semibold uppercase text-slate-700">
        {title}
      </h3>
      <KVTable rows={rows} />
      <p className="mt-2 text-sm">{footer}</p>
    </div>
  );
}
