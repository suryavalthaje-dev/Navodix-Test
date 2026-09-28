# Navodix Careers Admin — Master Codes v12

This version definitively uses new page filenames to avoid stale browser/server copies of the older master-maintenance pages.

- Clients screen: admin/clients-v12.html
- Job Categories screen: admin/job-categories-v12.html
- Client/Category Name is first (left); Code is second (right).
- Code is read-only and previews the 4-character system-generated code while typing.
- Existing database triggers remain the source of truth for permanent codes.
- All Admin navigation links point to the v12 filenames.
- Existing popup protection and navigation are retained.


Version v35 change: Job-specific Status History for Profile -> Requirement Associations. Run Navodix_Profile_Management_Job_Status_History_Migration_v1.0.sql before testing the history button. No Edge Function change is required for this feature.
