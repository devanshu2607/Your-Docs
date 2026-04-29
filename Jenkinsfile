pipeline {
    agent any

    options {
        skipDefaultCheckout()
    }

    environment {
        BACKEND_DIR = 'backend'
        AUTH_SERVICE_URL = 'http://auth-service:8000'
        DOCS_SERVICE_URL = 'http://docs-service:8000'
        WS_SERVICE_URL = 'ws://websocket-service:8000'
        PREDICTION_SERVICE_URL = 'http://prediction-service:8000'
        FRONTEND_URL = 'http://localhost:3000'
        CORS_ORIGINS = 'http://localhost:3000'
        SQL_DATABASE_URL = credentials('docs-sql-database-url')
        SECRET_KEY = credentials('docs-secret-key')
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'master', url: 'https://github.com/devanshu2607/Your-Docs'
            }
        }

        stage('Prepare Env') {
            steps {
                sh '''
                    cat > "$BACKEND_DIR/.env" <<EOF
SQL_DATABASE_URL=$SQL_DATABASE_URL
SECRET_KEY=$SECRET_KEY
AUTH_SERVICE_URL=$AUTH_SERVICE_URL
DOCS_SERVICE_URL=$DOCS_SERVICE_URL
WS_SERVICE_URL=$WS_SERVICE_URL
PREDICTION_SERVICE_URL=$PREDICTION_SERVICE_URL
FRONTEND_URL=$FRONTEND_URL
CORS_ORIGINS=$CORS_ORIGINS
EOF
                '''
            }
        }

        stage('Validate Compose') {
            steps {
                sh '''
                    cd "$BACKEND_DIR"
                    docker-compose config
                '''
            }
        }

        stage('Python Syntax Check') {
            steps {
                sh '''
                    docker run --rm \
                        -v "$PWD/backend:/workspace" \
                        -w /workspace \
                        python:3.10-slim \
                        python -m compileall .
                '''
            }
        }

        stage('Build Backend Images') {
            steps {
                sh '''
                    cd "$BACKEND_DIR"
                    docker-compose build
                '''
            }
        }

        stage('Deploy Backend') {
            steps {
                sh '''
                    cd "$BACKEND_DIR"
                    docker-compose up -d --force-recreate
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    cd "$BACKEND_DIR"
                    for i in 1 2 3 4 5 6 7 8 9 10; do
                        if docker-compose exec -T gateway-service python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5).read().decode())"; then
                            exit 0
                        fi
                        sleep 5
                    done
                    echo "Gateway health check failed"
                    exit 1
                '''
            }
        }
    }

    post {
        always {
            sh '''
                cd "$BACKEND_DIR"
                docker-compose ps
            '''
            sh 'rm -f backend/.env || true'
        }
        failure {
            sh '''
                cd "$BACKEND_DIR"
                docker-compose logs --tail 50
            '''
            sh 'rm -f backend/.env || true'
        }
    }
}
