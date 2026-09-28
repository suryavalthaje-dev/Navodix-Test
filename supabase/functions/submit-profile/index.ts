import { createClient } from 'npm:@supabase/supabase-js@2';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3';
import nodemailer from 'npm:nodemailer@9.1.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ACCOUNT_ID = Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID')!;
const ACCESS_KEY_ID = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID')!;
const SECRET_ACCESS_KEY = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY')!;
const BUCKET = Deno.env.get('CLOUDFLARE_R2_BUCKET') || 'navodix-profiles';
const SMTP_HOST = Deno.env.get('SMTP_HOST') || '';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') || '587');
const SMTP_USER = Deno.env.get('SMTP_USER') || '';
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') || '';
const HR_EMAIL = 'hr@navodix.com';
const SENDER_NAME = 'Navodix Human Resources';
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function clean(v: FormDataEntryValue | null) { return typeof v === 'string' ? v.trim() : ''; }
function validEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function extension(name: string) { return name.split('.').pop()?.toLowerCase() || ''; }
function safeFileName(name: string) { return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, 'resume').slice(0, 120) || 'resume'; }
function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
async function saveR2(path: string, body: BodyInit, contentType: string) {
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: path, Body: body, ContentType: contentType }));
}
async function deleteR2(path: string | null) {
  if (!path) return;
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: path }));
}
function createSmtpTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) throw new Error('SMTP configuration is not complete');
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: SMTP_PORT === 587,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
  });
}
function buildEmailRows(data: Record<string, string>) {
  const rows = [
    ['Profile Number', data.profile_number], ['Candidate Name', data.full_name], ['Email', data.email],
    ['Mobile', data.phone], ['Alternate Phone', data.alternate_phone], ['Current Location', data.current_location],
    ['Total Experience', data.total_experience], ['Current Job Title', data.current_job_title], ['Current Company', data.current_company],
    ['Notice Period', data.notice_period], ['Current CTC', data.current_ctc], ['Expected CTC', data.expected_ctc],
    ['Availability', data.availability], ['Highest Qualification', data.highest_qualification], ['Specialization', data.specialization],
    ['Graduation Year', data.graduation_year], ['Skills', data.skills], ['LinkedIn', data.linkedin_url],
    ['Additional Information', data.additional_information]
  ];
  return rows.filter(([,v]) => v).map(([label,value]) => `<tr><td style="padding:8px 10px;border:1px solid #ddd;font-weight:600;vertical-align:top;background:#f7f9fc;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(value)}</td></tr>`).join('');
}
function buildHrEmail(data: Record<string, string>) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5"><h2 style="margin:0 0 16px">New Profile Submission</h2><p>A candidate has submitted a profile through the Navodix Careers website.</p><table style="border-collapse:collapse;width:100%;max-width:800px;font-size:14px">${buildEmailRows(data)}</table><p style="margin-top:18px;color:#555">The latest resume is securely stored in the Navodix Profile repository.</p></div>`;
}
function buildCandidateEmail(data: Record<string,string>) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5"><h2 style="margin:0 0 16px">Profile Received - Navodix</h2><p>Dear ${escapeHtml(data.full_name)},</p><p>Thank you for submitting your profile to Navodix IT Solutions Private Limited.</p><p>Your Profile Number is <strong>${escapeHtml(data.profile_number)}</strong>. We will consider your profile for suitable current and future opportunities.</p><p>Your profile is not being submitted as an application for a specific job.</p><p>Regards,<br>${escapeHtml(SENDER_NAME)}</p></div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  let uploadedPath: string | null = null;
  try {
    const form = await req.formData();
    const resume = form.get('resume');
    if (!(resume instanceof File)) throw new Error('Resume is required');
    if (resume.size <= 0 || resume.size > MAX_RESUME_BYTES) throw new Error('Resume must be between 1 byte and 5 MB');
    const ext = extension(resume.name);
    if (!ALLOWED_EXTENSIONS.has(ext) || (resume.type && !ALLOWED_MIME.has(resume.type))) throw new Error('Resume must be a PDF, DOC or DOCX file');
    if (clean(form.get('consent')) !== 'true') throw new Error('Consent is required');

    const payload: Record<string, unknown> = {
      full_name: clean(form.get('full_name')),
      email: clean(form.get('email')).toLowerCase() || null,
      phone: clean(form.get('phone')),
      alternate_phone: clean(form.get('alternate_phone')) || null,
      current_location: clean(form.get('current_location')) || null,
      current_job_title: clean(form.get('current_job_title')) || null,
      current_company: clean(form.get('current_company')) || null,
      total_experience: clean(form.get('total_experience')) || null,
      notice_period: clean(form.get('notice_period')) || null,
      current_ctc: clean(form.get('current_ctc')) || null,
      expected_ctc: clean(form.get('expected_ctc')) || null,
      highest_qualification: clean(form.get('highest_qualification')) || null,
      specialization: clean(form.get('specialization')) || null,
      graduation_year: clean(form.get('graduation_year')) ? Number(clean(form.get('graduation_year'))) : null,
      skills: clean(form.get('skills')) || null,
      linkedin_url: clean(form.get('linkedin_url')) || null,
      availability: clean(form.get('availability')) || null,
      status: 'New',
      additional_information: clean(form.get('additional_information')) || null
    };

    if (!payload.full_name || !payload.phone || !payload.email || !payload.total_experience || !payload.highest_qualification || !payload.skills) throw new Error('Please complete all required fields');
    if (!validEmail(String(payload.email))) throw new Error('Please enter a valid email address');

    let profile: any = null;
    let created = false;
    const email = String(payload.email);
    const phone = String(payload.phone);

    const byEmail = await adminClient.from('profiles').select('*').ilike('email', email).limit(1).maybeSingle();
    if (byEmail.error) throw byEmail.error;
    profile = byEmail.data;
    if (!profile) {
      const byPhone = await adminClient.from('profiles').select('*').eq('phone', phone).limit(1).maybeSingle();
      if (byPhone.error) throw byPhone.error;
      profile = byPhone.data;
    }

    if (profile) {
      const updates: Record<string, unknown> = {};
      for (const [key,value] of Object.entries(payload)) {
        if (key === 'status') continue;
        if (value !== null && value !== '') updates[key] = value;
      }
      const { data, error } = await adminClient.from('profiles').update(updates).eq('id', profile.id).select('*').single();
      if (error) throw error;
      profile = data;
    } else {
      const { data, error } = await adminClient.from('profiles').insert({ ...payload, r2_profile_path: 'pending' }).select('*').single();
      if (error) throw error;
      profile = data;
      created = true;
      const profilePath = `profiles/${profile.profile_number}`;
      const { data: updated, error: pathError } = await adminClient.from('profiles').update({ r2_profile_path: profilePath }).eq('id', profile.id).select('*').single();
      if (pathError) throw pathError;
      profile = updated;
    }

    const profilePath = profile.r2_profile_path || `profiles/${profile.profile_number}`;
    const newResumePath = `${profilePath}/resume.${ext}`;
    const resumeBytes = new Uint8Array(await resume.arrayBuffer());
    await saveR2(newResumePath, resumeBytes, resume.type || 'application/octet-stream');
    uploadedPath = newResumePath;

    const oldResume = profile.resume_object_path;
    const { error: resumeError } = await adminClient.from('profiles').update({ resume_object_path: newResumePath, resume_file_name: safeFileName(resume.name), resume_updated_at: new Date().toISOString() }).eq('id', profile.id);
    if (resumeError) { await deleteR2(newResumePath); uploadedPath = null; throw resumeError; }
    if (oldResume && oldResume !== newResumePath) await deleteR2(oldResume);

    const profileJson = { profile_number: profile.profile_number, full_name: profile.full_name, email: profile.email, phone: profile.phone, alternate_phone: profile.alternate_phone, current_location: profile.current_location, current_job_title: profile.current_job_title, current_company: profile.current_company, total_experience: profile.total_experience, notice_period: profile.notice_period, current_ctc: profile.current_ctc, expected_ctc: profile.expected_ctc, highest_qualification: profile.highest_qualification, specialization: profile.specialization, graduation_year: profile.graduation_year, skills: profile.skills, linkedin_url: profile.linkedin_url, availability: profile.availability, status: profile.status, additional_information: profile.additional_information, resume: { object_path: newResumePath, file_name: safeFileName(resume.name), updated_at: new Date().toISOString() }, updated_at: profile.updated_at };
    await saveR2(`${profilePath}/profile.json`, JSON.stringify(profileJson, null, 2), 'application/json');

    const { data: existingSource, error: sourceError } = await adminClient.from('profile_sources').select('id').eq('profile_id', profile.id).eq('source', 'Submit Your Profile').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (sourceError) throw sourceError;
    const { error: clearError } = await adminClient.from('profile_sources').update({ is_primary: false }).eq('profile_id', profile.id);
    if (clearError) throw clearError;
    if (existingSource) {
      const { error } = await adminClient.from('profile_sources').update({ is_primary: true }).eq('id', existingSource.id);
      if (error) throw error;
    } else {
      const { error } = await adminClient.from('profile_sources').insert({ profile_id: profile.id, source: 'Submit Your Profile', source_details: 'Public Careers website', is_primary: true });
      if (error) throw error;
    }

    const emailData: Record<string,string> = {};
    for (const [k,v] of Object.entries(profile)) emailData[k] = v == null ? '' : String(v);
    emailData.profile_number = String(profile.profile_number);
    emailData.phone = phone;
    emailData.alternate_phone = String(payload.alternate_phone || '');
    emailData.current_location = String(payload.current_location || '');
    emailData.total_experience = String(payload.total_experience || '');
    emailData.current_job_title = String(payload.current_job_title || '');
    emailData.current_company = String(payload.current_company || '');
    emailData.notice_period = String(payload.notice_period || '');
    emailData.current_ctc = String(payload.current_ctc || '');
    emailData.expected_ctc = String(payload.expected_ctc || '');
    emailData.availability = String(payload.availability || '');
    emailData.highest_qualification = String(payload.highest_qualification || '');
    emailData.specialization = String(payload.specialization || '');
    emailData.graduation_year = String(payload.graduation_year || '');
    emailData.skills = String(payload.skills || '');
    emailData.linkedin_url = String(payload.linkedin_url || '');
    emailData.additional_information = String(payload.additional_information || '');

    let hrEmailStatus = 'sent';
    let candidateEmailStatus = 'sent';
    try {
      const transporter = createSmtpTransporter();
      await transporter.verify();
      await transporter.sendMail({ from: `${SENDER_NAME} <${SMTP_USER}>`, to: HR_EMAIL, subject: `New Profile Submission - ${emailData.full_name} - ${emailData.profile_number}`, html: buildHrEmail(emailData), replyTo: email });
    } catch (err) {
      hrEmailStatus = 'failed';
      console.error('HR profile notification failed:', err);
    }
    try {
      const transporter = createSmtpTransporter();
      await transporter.sendMail({ from: `${SENDER_NAME} <${SMTP_USER}>`, to: email, subject: `Profile Received - Navodix - ${emailData.profile_number}`, html: buildCandidateEmail(emailData), replyTo: HR_EMAIL });
    } catch (err) {
      candidateEmailStatus = 'failed';
      console.error('Candidate profile acknowledgement failed:', err);
    }

    return json({ success: true, created, profile_id: profile.id, profile_number: profile.profile_number, hr_email_status: hrEmailStatus, candidate_email_status: candidateEmailStatus });
  } catch (err) {
    if (uploadedPath) await deleteR2(uploadedPath).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: message }, 400);
  }
});
