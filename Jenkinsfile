pipeline {
    agent any

    environment {
        BACKEND_DIR = 'backend'
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'master', url: 'https://github.com/devanshu2607/Your-Docs'
            }
        }

        stage('Validate Compose') {
            steps {
                sh '''
                    cd "$BACKEND_DIR"
                    docker compose config
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
                    docker compose build
                '''
            }
        }

        stage('Deploy Backend') {
            steps {
                sh '''
                    cd "$BACKEND_DIR"
                    docker compose up -d --force-recreate
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    cd "$BACKEND_DIR"
                    for i in 1 2 3 4 5 6 7 8 9 10; do
                        if docker compose exec -T gateway-service python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5).read().decode())"; then
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
                docker compose ps
            '''
        }
        failure {
            sh '''
                cd "$BACKEND_DIR"
                docker compose logs --tail 50
            '''
        }
    }
}
