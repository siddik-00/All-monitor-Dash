{{- define "control-api.name" -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}
{{- define "control-api.clusterRole" -}}
{{- printf "%s-%s" .Release.Namespace (include "control-api.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "control-api.selector" -}}
app.kubernetes.io/name: control-api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "control-api.labels" -}}
{{ include "control-api.selector" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}
