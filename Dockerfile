FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 NODE_OPTIONS=--max-old-space-size=192
COPY --chown=10001:10001 package.json ./
COPY --chown=10001:10001 apps ./apps
COPY --chown=10001:10001 packages ./packages
COPY --chown=10001:10001 workflows ./workflows
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","apps/control-api/src/server.mjs"]
