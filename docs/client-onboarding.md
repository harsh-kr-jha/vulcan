# Client Onboarding

Step-by-step procedure to bring a new customer from signing to go-live.

## 1. Classify the Customer

Determine:
- **Industry**: Manufacturing (MFG)
- **Operating Archetype**: Discrete Assembly (DA), Process Continuous (PMC), etc.
- **Sub-sector**: Automotive (AUTO), Agriculture (AGRI), etc.

This determines which operating template to use, e.g. `MFG.DA.AUTO.ALL`.

## 2. Select Operating Template

Use the closest existing template. If the customer fits an existing template:
```
MFG.DA.AUTO.ALL    → Automotive discrete assembly
MFG.PMC.AGRI.ALL  → Agriculture process manufacturing
```

Create a new operating template only if the industry vertical is fundamentally different.

## 3. Create Client Branch

```bash
git checkout MFG.DA.AUTO.ALL
git checkout -b client/MFG.DA.AUTO.ALL/NEWCLIENT
```

Client code rules: uppercase alphanumeric, 3-12 characters.

## 4. Create Client Configuration

Create `config/config.json`:
```json
{
  "clientId": "NEWCLIENT",
  "displayName": "New Client Factory Pune",
  "factoryCode": "NEWCLIENT-PUNE",
  "configVersion": "NEWCLIENT-C01",
  "deploymentId": "newclient-prod-01"
}
```

## 5. Provision Customer GCP

Using the customer's GCP project, provision:
- VPC and subnet
- GCE VM (e2-small or larger)
- Cloud Storage bucket for backups
- Service account for the VM

Required directories on VM:
```
/opt/tamaso/          — deployment files and .env
/var/lib/tamaso/<CUSTOMER_ID>/data/     — application data
/var/lib/tamaso/<CUSTOMER_ID>/backups/  — local backup copies
/var/lib/tamaso/<CUSTOMER_ID>/static/   — collected static files
```

## 6. Create Runtime Identity

Create a service account for the customer VM:
```
tamaso-runtime@<customer-project>.iam.gserviceaccount.com
```

Grant it:
- `roles/artifactregistry.reader` on the Tamaso AR repository
- `roles/storage.objectAdmin` on the customer backup bucket

## 7. Grant Artifact Registry Access

In the Tamaso GCP project, grant the customer's runtime service account read access:
```bash
gcloud artifacts repositories add-iam-policy-binding vulcan \
  --project=gentle-broker-505219-d0 \
  --location=us-central1 \
  --member="serviceAccount:tamaso-runtime@<customer-project>.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"
```

## 8. Configure GitHub Environment

Create a GitHub environment `gcp-<CUSTOMER_ID>` with:
- `GCP_WORKLOAD_IDENTITY_PROVIDER` — Workload Identity pool provider
- `GCP_DEPLOY_SERVICE_ACCOUNT` — SA with SSH and deploy permissions
- `GCE_INSTANCE` — VM instance name
- `GCE_ZONE` — VM zone
- `GCP_PROJECT_ID` — Customer's GCP project
- `APP_URL` — Public URL for health checks

## 9. Initial Deployment

Push the client branch to trigger artifact build:
```bash
git push -u origin client/MFG.DA.AUTO.ALL/NEWCLIENT
```

Wait for `build-artifact.yml` to complete. Note the output digests.

Trigger `deploy-customer.yml` with:
- customer_id: `NEWCLIENT`
- deployment_id: `newclient-prod-01`
- backend_digest: `sha256:<from-build-output>`
- frontend_digest: `sha256:<from-build-output>`
- config_version: `NEWCLIENT-C01`
- reason: `Initial deployment`

## 10. Connect Factory Data

Configure in the running application:
- Factory hierarchy (lines, processes, machines)
- Shifts and schedules
- KPI targets and alert thresholds
- Upload initial operational data (CSV/XLSX)

## 11. Go-Live Validation

Verify:
- [ ] Application accessible at customer URL
- [ ] Health endpoint responds
- [ ] Login works
- [ ] Data upload and processing
- [ ] KPI calculations
- [ ] Dashboard renders
- [ ] Backup runs successfully
- [ ] Deploy script rollback tested

## 12. Record Deployment

Final deployment state:
```
Customer:       NEWCLIENT
Deployment:     newclient-prod-01
Software:       MFG.DA.AUTO.ALL
Version:        1.0.0
Backend Digest: sha256:...
Frontend Digest: sha256:...
Configuration:  NEWCLIENT-C01
Status:         ACTIVE
Deployed:       <date>
```
