import { createClient } from 'npm:@supabase/supabase-js@2';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ACCOUNT_ID = Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID')!;
const ACCESS_KEY_ID = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID')!;
const SECRET_ACCESS_KEY = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY')!;
const BUCKET = Deno.env.get('CLOUDFLARE_R2_BUCKET') || 'navodix-profiles';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);

const adminClient = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function clean(v: FormDataEntryValue | null) {
  return typeof v === 'string' ? v.trim() : '';
}

function extension(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function safeFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, 'resume');
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get('authorization') || '';

  if (!auth.toLowerCase().startsWith('bearer ')) {
    throw new Error('Authentication is required.');
  }

  const token = auth.slice(7);

  const userClient = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      },
      auth: {
        persistSession: false
      }
    }
  );

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser(token);

  if (userError || !user) {
    throw new Error('Your session is invalid or expired.');
  }

  const {
    data: isAdmin,
    error: adminError
  } = await userClient.rpc('is_careers_admin');

  if (adminError || isAdmin !== true) {
    throw new Error(
      'This account is not authorized as a Careers Admin.'
    );
  }

  return {
    user,
    userClient
  };
}

function profilePayload(fd: FormData) {
  const year = clean(fd.get('graduation_year'));

  return {
    full_name: clean(fd.get('full_name')),
    email: clean(fd.get('email')) || null,
    phone: clean(fd.get('phone')),
    alternate_phone: clean(fd.get('alternate_phone')) || null,
    current_location: clean(fd.get('current_location')) || null,
    current_job_title: clean(fd.get('current_job_title')) || null,
    current_company: clean(fd.get('current_company')) || null,
    total_experience: clean(fd.get('total_experience')) || null,
    notice_period: clean(fd.get('notice_period')) || null,
    current_ctc: clean(fd.get('current_ctc')) || null,
    expected_ctc: clean(fd.get('expected_ctc')) || null,
    highest_qualification:
      clean(fd.get('highest_qualification')) || null,
    specialization: clean(fd.get('specialization')) || null,
    graduation_year: year ? Number(year) : null,
    skills: clean(fd.get('skills')) || null,
    linkedin_url: clean(fd.get('linkedin_url')) || null,
    github_url: clean(fd.get('github_url')) || null,
    availability: clean(fd.get('availability')) || null,
    status: clean(fd.get('status')) || 'New',
    additional_information:
      clean(fd.get('additional_information')) || null
  };
}

async function findDuplicate(
  payload: ReturnType<typeof profilePayload>,
  excludeId = ''
) {
  if (payload.email) {
    const {
      data
    } = await adminClient
      .from('profiles')
      .select(
        'id,profile_number,full_name,email,resume_object_path'
      )
      .ilike('email', payload.email)
      .limit(1)
      .maybeSingle();

    if (data && data.id !== excludeId) {
      return data;
    }
  }

  if (payload.phone) {
    const {
      data
    } = await adminClient
      .from('profiles')
      .select(
        'id,profile_number,full_name,email,phone,resume_object_path'
      )
      .eq('phone', payload.phone)
      .limit(1)
      .maybeSingle();

    if (data && data.id !== excludeId) {
      return data;
    }
  }

  return null;
}

async function saveR2(
  path: string,
  body: BodyInit,
  contentType: string
) {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: path,
      Body: body,
      ContentType: contentType
    })
  );
}

async function deleteR2(path: string | null) {
  if (!path) return;

  await r2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: path
    })
  );
}
\nasync function deleteR2Prefix(prefix: string) {\n  let continuationToken: string | undefined;\n  do {\n    const listed = await r2.send(new ListObjectsV2Command({\n      Bucket: BUCKET,\n      Prefix: prefix,\n      ContinuationToken: continuationToken\n    }));\n    const objects = (listed.Contents || []).filter(x => x.Key).map(x => ({ Key: x.Key! }));\n    if (objects.length) {\n      await r2.send(new DeleteObjectsCommand({\n        Bucket: BUCKET,\n        Delete: { Objects: objects, Quiet: true }\n      }));\n    }\n    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;\n  } while (continuationToken);\n}\n\nasync function removeAssociation(profileId: string, associationId: string) {
  if (!profileId || !associationId) throw new Error('Profile and association IDs are required.');
  const { data: association, error: associationError } = await adminClient
    .from('profile_requirement_associations')
    .select('id,profile_id,requirement_id')
    .eq('id', associationId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (associationError) throw associationError;
  if (!association) throw new Error('The job association was not found.');

  const { error: interviewError } = await adminClient
    .from('profile_requirement_interviews')
    .delete()
    .eq('profile_id', profileId)
    .eq('requirement_id', association.requirement_id);
  if (interviewError) throw interviewError;

  const { error: notesError } = await adminClient
    .from('profile_notes')
    .delete()
    .eq('profile_id', profileId)
    .eq('requirement_id', association.requirement_id);
  if (notesError) throw notesError;

  const { error: deleteError } = await adminClient
    .from('profile_requirement_associations')
    .delete()
    .eq('id', associationId)
    .eq('profile_id', profileId);
  if (deleteError) throw deleteError;

  return { success: true, profile_id: profileId, association_id: associationId };
}

async function deleteProfile(profileId: string) {\n  if (!profileId) throw new Error('Profile ID is required.');\n\n  const { data: profile, error: profileError } = await adminClient\n    .from('profiles')\n    .select('id,profile_number')\n    .eq('id', profileId)\n    .maybeSingle();\n  if (profileError) throw profileError;\n  if (!profile) throw new Error('Profile was not found.');\n\n  const childTables = [\n    'profile_requirement_interviews',\n    'profile_requirement_associations',\n    'profile_notes',\n    'profile_status_history',\n    'profile_sources',\n    'profile_categories'\n  ];\n  for (const table of childTables) {\n    const { error } = await adminClient.from(table).delete().eq('profile_id', profileId);\n    if (error) throw error;\n  }\n\n  const { error: deleteProfileError } = await adminClient\n    .from('profiles')\n    .delete()\n    .eq('id', profileId);\n  if (deleteProfileError) throw deleteProfileError;\n\n  await deleteR2Prefix(`profiles/${profile.profile_number}/`);\n\n  return { success: true, profile_id: profileId, profile_number: profile.profile_number };\n}\n

function resumeContentType(fileName: string | null | undefined) {
  const ext = extension(fileName || '');
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

async function createResumeSignedUrl(profileId: string) {
  if (!profileId) {
    throw new Error('Profile ID is required.');
  }

  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('id, profile_number, resume_object_path, resume_file_name')
    .eq('id', profileId)
    .single();

  if (error) throw error;

  if (!profile.resume_object_path) {
    throw new Error('No resume is stored for this profile.');
  }

  const fileName = profile.resume_file_name || profile.resume_object_path.split('/').pop() || 'resume';
  const contentType = resumeContentType(fileName);

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: profile.resume_object_path,
    ResponseContentType: contentType,
    ResponseContentDisposition: `inline; filename="${safeFileName(fileName)}"`
  });

  const signedUrl = await getSignedUrl(r2, command, {
    expiresIn: 300
  });

  return {
    success: true,
    profile_id: profile.id,
    profile_number: profile.profile_number,
    file_name: fileName,
    content_type: contentType,
    expires_in: 300,
    signed_url: signedUrl
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    const { user } = await requireAdmin(req);

    if (req.method !== 'POST') {
      return json(
        { error: 'POST is required.' },
        405
      );
    }

    const fd = await req.formData();

    const action = clean(fd.get('action'));

    // Resume access is intentionally handled before the normal create/update
    // validation because this request only needs the profile ID.
    if (action === 'resume-url') {
      const profileIdForResume = clean(fd.get('profile_id'));
      return json(await createResumeSignedUrl(profileIdForResume));
    }

    if (action === 'delete-profile') {
      const profileIdForDelete = clean(fd.get('profile_id'));
      return json(await deleteProfile(profileIdForDelete));
    }

    if (action === 'remove-association') {
      const profileIdForAssociation = clean(fd.get('profile_id'));
      const associationIdForRemoval = clean(fd.get('association_id'));
      return json(await removeAssociation(profileIdForAssociation, associationIdForRemoval));
    }

    const profileId = clean(
      fd.get('profile_id')
    );

    const requirementId = clean(
      fd.get('requirement_id')
    );

    const payload = profilePayload(fd);

    if (!payload.full_name || !payload.phone) {
      return json(
        {
          error:
            'Full Name and Phone are required.'
        },
        400
      );
    }

    const source = clean(
      fd.get('source')
    );

    if (!source) {
      return json(
        {
          error: 'Source is required.'
        },
        400
      );
    }

    const fileEntry = fd.get('resume');

    const file =
      fileEntry instanceof File
        ? fileEntry
        : null;

    const replaceResume =
      clean(fd.get('replace_resume')) === 'true';

    const duplicate = await findDuplicate(
      payload,
      profileId
    );

    if (duplicate) {
      return json(
        {
          duplicate: true,
          profile_id: duplicate.id,
          profile_number:
            duplicate.profile_number,
          full_name: duplicate.full_name,
          has_resume:
            Boolean(
              duplicate.resume_object_path
            )
        },
        409
      );
    }

    if (file) {
      if (file.size > MAX_RESUME_BYTES) {
        return json(
          {
            error:
              'Resume must be 5 MB or smaller.'
          },
          400
        );
      }

      const ext = extension(file.name);

      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return json(
          {
            error:
              'Resume must be PDF, DOC or DOCX.'
          },
          400
        );
      }
    }

    let profile;
    let oldResume: string | null = null;
    let newResumePath: string | null = null;

    if (profileId) {
      const {
        data,
        error
      } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .single();

      if (error) throw error;

      profile = data;
      oldResume = data.resume_object_path;

      if (
        file &&
        oldResume &&
        !replaceResume
      ) {
        return json(
          {
            resume_existing: true,
            resume_replaced: false,
            profile_id: profileId
          },
          200
        );
      }

      const {
        data: updated,
        error: updateError
      } = await adminClient
        .from('profiles')
        .update({
          ...payload,
          updated_by: user.id
        })
        .eq('id', profileId)
        .select('*')
        .single();

      if (updateError) throw updateError;

      profile = updated;

    } else {

      const {
        data: inserted,
        error: insertError
      } = await adminClient
        .from('profiles')
        .insert({
          ...payload,
          r2_profile_path: 'pending',
          created_by: user.id,
          updated_by: user.id
        })
        .select('*')
        .single();

      if (insertError) throw insertError;

      profile = inserted;

      const profilePath =
        `profiles/${profile.profile_number}`;

      const {
        data: updated,
        error: pathError
      } = await adminClient
        .from('profiles')
        .update({
          r2_profile_path: profilePath
        })
        .eq('id', profile.id)
        .select('*')
        .single();

      if (pathError) throw pathError;

      profile = updated;
    }

    const profilePath =
      profile.r2_profile_path ||
      `profiles/${profile.profile_number}`;

    if (
      file &&
      (!profile.resume_object_path ||
        replaceResume)
    ) {
      newResumePath =
        `${profilePath}/resume.${extension(file.name)}`;

      const resumeBytes = new Uint8Array(
        await file.arrayBuffer()
      );

      await saveR2(
        newResumePath,
        resumeBytes,
        file.type ||
          'application/octet-stream'
      );

      const {
        error
      } = await adminClient
        .from('profiles')
        .update({
          resume_object_path:
            newResumePath,
          resume_file_name:
            safeFileName(file.name),
          resume_updated_at:
            new Date().toISOString(),
          updated_by: user.id
        })
        .eq('id', profile.id);

      if (error) {
        await deleteR2(newResumePath);
        throw error;
      }

      if (
        oldResume &&
        oldResume !== newResumePath
      ) {
        await deleteR2(oldResume);
      }

      profile.resume_object_path =
        newResumePath;

      profile.resume_file_name =
        safeFileName(file.name);
    }

    const profileJson = {
      profile_number:
        profile.profile_number,

      full_name:
        profile.full_name,

      email:
        profile.email,

      phone:
        profile.phone,

      alternate_phone:
        profile.alternate_phone,

      current_location:
        profile.current_location,

      current_job_title:
        profile.current_job_title,

      current_company:
        profile.current_company,

      total_experience:
        profile.total_experience,

      notice_period:
        profile.notice_period,

      current_ctc:
        profile.current_ctc,

      expected_ctc:
        profile.expected_ctc,

      highest_qualification:
        profile.highest_qualification,

      specialization:
        profile.specialization,

      graduation_year:
        profile.graduation_year,

      skills:
        profile.skills,

      linkedin_url:
        profile.linkedin_url,

      github_url:
        profile.github_url,

      availability:
        profile.availability,

      status:
        profile.status,

      additional_information:
        profile.additional_information,

      resume:
        profile.resume_object_path
          ? {
              object_path:
                profile.resume_object_path,
              file_name:
                profile.resume_file_name,
              updated_at:
                profile.resume_updated_at
            }
          : null,

      updated_at:
        profile.updated_at
    };

    await saveR2(
      `${profilePath}/profile.json`,
      JSON.stringify(
        profileJson,
        null,
        2
      ),
      'application/json'
    );

    const sourceDetails =
      clean(fd.get('source_details')) || null;
    const referrerName =
      clean(fd.get('referrer_name')) || null;
    const referrerMobile =
      clean(fd.get('referrer_mobile')) || null;
    const referrerEmail =
      clean(fd.get('referrer_email')) || null;

    // A profile can have multiple genuine source origins over time,
    // but saving the same source again must not create another row.
    // Reuse the latest existing row for this source and make it primary.
    const {
      data: existingSources,
      error: sourceLookupError
    } = await adminClient
      .from('profile_sources')
      .select('id, source, created_at')
      .eq('profile_id', profile.id)
      .eq('source', source)
      .order('created_at', { ascending: false })
      .limit(1);

    if (sourceLookupError) {
      throw sourceLookupError;
    }

    // There must be exactly one primary source for the profile.
    const {
      error: clearPrimaryError
    } = await adminClient
      .from('profile_sources')
      .update({ is_primary: false })
      .eq('profile_id', profile.id);

    if (clearPrimaryError) {
      throw clearPrimaryError;
    }

    if (existingSources?.length) {
      const {
        error: sourceUpdateError
      } = await adminClient
        .from('profile_sources')
        .update({
          source_details: sourceDetails,
          referrer_name: referrerName,
          referrer_mobile: referrerMobile,
          referrer_email: referrerEmail,
          is_primary: true
        })
        .eq('id', existingSources[0].id);

      if (sourceUpdateError) {
        throw sourceUpdateError;
      }
    } else {
      const {
        error: sourceInsertError
      } = await adminClient
        .from('profile_sources')
        .insert({
          profile_id: profile.id,
          source,
          source_details: sourceDetails,
          referrer_name: referrerName,
          referrer_mobile: referrerMobile,
          referrer_email: referrerEmail,
          is_primary: true,
          created_by: user.id
        });

      if (sourceInsertError) {
        throw sourceInsertError;
      }
    }

    let associated = false;

    if (requirementId) {

      const {
        data: requirement,
        error: requirementError
      } = await adminClient
        .from('jobs')
        .select('id')
        .eq('id', requirementId)
        .maybeSingle();

      if (requirementError) {
        throw requirementError;
      }

      if (!requirement) {
        return json(
          {
            error:
              'The selected requirement could not be found.'
          },
          400
        );
      }

      const {
        error: assocError
      } = await adminClient
        .from(
          'profile_requirement_associations'
        )
        .upsert(
          {
            profile_id:
              profile.id,

            requirement_id:
              requirementId,

            association_type:
              'manual',

            status:
              'New',

            associated_by:
              user.id
          },
          {
            onConflict:
              'profile_id,requirement_id'
          }
        );

      if (assocError) {
        throw assocError;
      }

      associated = true;
    }

    return json({
      success: true,
      profile_id:
        profile.id,

      profile_number:
        profile.profile_number,

      associated,

      resume_replaced:
        Boolean(newResumePath)
    });

  } catch (error) {

    console.error(error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error)
      },
      500
    );
  }
});