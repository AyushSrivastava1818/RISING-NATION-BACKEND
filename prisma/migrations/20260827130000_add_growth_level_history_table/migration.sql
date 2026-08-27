-- CreateTable
CREATE TABLE "growth_level_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_level" TEXT,
    "to_level" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_level_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "growth_level_history_user_id_idx" ON "growth_level_history"("user_id");

-- AddForeignKey
ALTER TABLE "growth_level_history" ADD CONSTRAINT "growth_level_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_level_history" ADD CONSTRAINT "growth_level_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
