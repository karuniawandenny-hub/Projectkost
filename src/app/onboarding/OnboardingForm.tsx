"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitOnboarding, type OnboardingState } from "./actions";
import { CameraInput } from "@/components/CameraInput";

const initial: OnboardingState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Mengunggah…" : "Simpan & lanjut"}
    </button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useFormState(submitOnboarding, initial);
  return (
    <form action={formAction} className="space-y-6">
      <CameraInput
        name="ktp"
        required
        label="Foto / scan KTP"
        capture="environment"
        helper="Pastikan teks pada KTP jelas terbaca. Format: JPG/PNG/PDF, maks 8 MB."
      />
      <CameraInput
        name="selfie"
        required
        label="Foto diri (selfie)"
        capture="user"
        helper="Foto wajah Anda dengan pencahayaan baik."
      />

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
